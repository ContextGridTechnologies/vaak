import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

type TauriWindowConfig = {
  label: string;
  title?: string;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  decorations?: boolean;
};

type TauriConfig = {
  identifier: string;
  productName: string;
  bundle?: {
    active?: boolean;
    publisher?: string | null;
    homepage?: string | null;
    licenseFile?: string | null;
    targets?: string | string[] | null;
    category?: string | null;
    shortDescription?: string | null;
    longDescription?: string | null;
    icon?: string[];
    windows?: {
      allowDowngrades?: boolean;
      webviewInstallMode?: {
        type?: string;
        silent?: boolean;
      };
      nsis?: {
        installerIcon?: string | null;
        installMode?: string | null;
        startMenuFolder?: string | null;
      };
    };
  };
  app: {
    windows: TauriWindowConfig[];
    security?: {
      capabilities?: string[];
      csp?: string | null;
      devCsp?: string | null;
    };
  };
};

describe("Tauri window configuration", () => {
  it("uses the Vaak app name and opens the main app at a production desktop size", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
    ) as TauriConfig;
    const credentialsSource = readFileSync(
      join(process.cwd(), "src-tauri", "src", "providers", "credentials.rs"),
      "utf8",
    );

    const mainWindow = config.app.windows.find((window) => window.label === "main");

    expect(config.productName).toBe("Vaak");
    expect(config.identifier).toBe("ai.vaak.desktop");
    expect(credentialsSource).toContain('const SERVICE_NAME: &str = "ai.vaak.desktop";');
    expect(mainWindow).toMatchObject({
      title: "Vaak",
      width: 1040,
      height: 740,
      minWidth: 760,
      minHeight: 620,
      decorations: true,
    });
  });
});

describe("Tauri icon assets", () => {
  it("keeps a Vaak icon source and generated PNG sizes for packaging", () => {
    const iconDir = join(process.cwd(), "src-tauri", "icons");

    expect(existsSync(join(iconDir, "vaak-icon-source.png"))).toBe(true);
    expect(readPngSize(join(iconDir, "icon.png"))).toEqual({
      width: 512,
      height: 512,
    });
    expect(readPngSize(join(iconDir, "128x128.png"))).toEqual({
      width: 128,
      height: 128,
    });
    expect(readPngSize(join(iconDir, "32x32.png"))).toEqual({
      width: 32,
      height: 32,
    });
  });
});

describe("Tauri security configuration", () => {
  it("ships a CSP and avoids broad opener permissions", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
    ) as TauriConfig;
    const mainCapability = JSON.parse(
      readFileSync(
        join(process.cwd(), "src-tauri", "capabilities", "main.json"),
        "utf8",
      ),
    ) as { windows: string[]; permissions: string[] };
    const voiceCapsuleCapability = JSON.parse(
      readFileSync(
        join(process.cwd(), "src-tauri", "capabilities", "voice-capsule.json"),
        "utf8",
      ),
    ) as { windows: string[]; permissions: string[] };

    const csp = config.app.security?.csp ?? "";
    const devCsp = config.app.security?.devCsp ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' ipc: http://ipc.localhost");
    expect(csp).toContain("asset: http://asset.localhost");
    expect(csp).toContain("media-src 'self' blob: asset: http://asset.localhost");
    expect(csp).toContain("https://api.openai.com");
    expect(csp).toContain("https://*.openai.azure.com");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");

    expect(devCsp).toContain("connect-src 'self' ipc: http://ipc.localhost");
    expect(devCsp).toContain("http://localhost:1420");
    expect(devCsp).toContain("ws://localhost:1421");
    expect(devCsp).toContain("http://127.0.0.1:1420");
    expect(devCsp).toContain("ws://127.0.0.1:1421");
    expect(devCsp).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'");
    expect(config.app.security?.capabilities).toEqual([
      "main",
      "voice-capsule",
    ]);
    expect(mainCapability.windows).toEqual(["main"]);
    expect(mainCapability.permissions).toContain("opener:allow-reveal-item-in-dir");
    expect(mainCapability.permissions).not.toContain("opener:default");
    expect(voiceCapsuleCapability.windows).toEqual(["voice-capsule"]);
    expect(voiceCapsuleCapability.permissions).toEqual([
      "core:window:default",
      "core:event:default",
      "core:window:allow-start-dragging",
      "core:window:allow-set-position",
    ]);
  });

  it("does not duplicate CSP delivery in index.html", () => {
    const indexHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");

    expect(indexHtml).not.toContain("http-equiv=\"Content-Security-Policy\"");
  });
});

describe("Desktop release metadata", () => {
  it("uses production package metadata and release build settings", () => {
    const cargoToml = readFileSync(join(process.cwd(), "src-tauri", "Cargo.toml"), "utf8");
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { name: string };
    const rootGitignore = readFileSync(join(process.cwd(), "..", "..", ".gitignore"), "utf8");
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
    ) as TauriConfig;

    expect(packageJson.name).toBe("vaak-desktop");
    expect(cargoToml).toContain('name = "vaak-desktop"');
    expect(cargoToml).toContain('description = "Open-source, local-first voice input for desktop workflows."');
    expect(cargoToml).toContain('authors = ["Vaak Contributors"]');
    expect(cargoToml).toContain('homepage = "https://github.com/vaak-ai/vaak"');
    expect(cargoToml).toContain('license = "MIT"');
    expect(cargoToml).toContain("[profile.release]");
    expect(cargoToml).toContain('codegen-units = 1');
    expect(cargoToml).toContain('lto = true');
    expect(cargoToml).toContain('opt-level = "s"');
    expect(cargoToml).toContain('panic = "abort"');
    expect(cargoToml).toContain('strip = true');
    expect(rootGitignore).not.toContain("src-tauri/*.lock");

    expect(config.bundle).toMatchObject({
      active: true,
      publisher: "Vaak Contributors",
      homepage: "https://github.com/vaak-ai/vaak",
      licenseFile: "../../../LICENSE",
      targets: "nsis",
      category: "Productivity",
      shortDescription: "Open-source, local-first voice input for desktop workflows.",
      windows: {
        allowDowngrades: false,
        webviewInstallMode: {
          type: "downloadBootstrapper",
          silent: true,
        },
        nsis: {
          installerIcon: "icons/icon.ico",
          installMode: "currentUser",
          startMenuFolder: "Vaak",
        },
      },
    });
    expect(config.bundle?.longDescription).toContain("bring your own model or API key");
    expect(config.bundle?.icon).toEqual([
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico",
    ]);
  });
});

function readPngSize(path: string): { width: number; height: number } {
  const file = readFileSync(path);

  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}
