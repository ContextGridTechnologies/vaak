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
  plugins?: {
    updater?: {
      pubkey?: string;
      endpoints?: string[];
      windows?: {
        installMode?: string;
      };
    };
  };
  bundle?: {
    active?: boolean;
    createUpdaterArtifacts?: boolean;
    publisher?: string | null;
    homepage?: string | null;
    licenseFile?: string | null;
    targets?: string | string[] | null;
    category?: string | null;
    shortDescription?: string | null;
    longDescription?: string | null;
    icon?: string[];
    resources?: string[];
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
    expect(csp).toContain("wss://agents.assemblyai.com");
    expect(csp).toContain("https://*.openai.azure.com");
    expect(csp).toContain("https://us.i.posthog.com");
    expect(csp).toContain("https://eu.i.posthog.com");
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");

    expect(devCsp).toContain("connect-src 'self' ipc: http://ipc.localhost");
    expect(devCsp).toContain("http://localhost:1420");
    expect(devCsp).toContain("ws://localhost:1421");
    expect(devCsp).toContain("http://127.0.0.1:1420");
    expect(devCsp).toContain("ws://127.0.0.1:1421");
    expect(devCsp).toContain("wss://agents.assemblyai.com");
    expect(devCsp).toContain("https://us.i.posthog.com");
    expect(devCsp).toContain("https://eu.i.posthog.com");
    expect(devCsp).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'");
    expect(config.app.security?.capabilities).toEqual([
      "main",
      "voice-capsule",
    ]);
    expect(mainCapability.windows).toEqual(["main"]);
    expect(mainCapability.permissions).toContain("opener:allow-open-url");
    expect(mainCapability.permissions).toContain("opener:allow-default-urls");
    expect(mainCapability.permissions).toContain("opener:allow-reveal-item-in-dir");
    expect(mainCapability.permissions).toContain("updater:default");
    expect(mainCapability.permissions).toContain("process:allow-restart");
    expect(mainCapability.permissions).not.toContain("opener:default");
    expect(voiceCapsuleCapability.windows).toEqual(["voice-capsule"]);
    expect(voiceCapsuleCapability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:default",
        "core:event:default",
        "core:window:allow-start-dragging",
        "core:window:allow-set-position",
        "allow-get-assemblyai-voice-agent-token",
        "allow-execute-voice-agent-tool",
        "allow-resolve-voice-agent-tool-approval",
      ]),
    );
    expect(mainCapability.permissions).toContain("allow-get-mcp-connectors");
    expect(mainCapability.permissions).toContain("allow-set-mcp-tool-grant");
    expect(voiceCapsuleCapability.permissions).not.toContain("allow-get-mcp-connectors");
    expect(voiceCapsuleCapability.permissions).not.toContain("process:allow-restart");
    expect(voiceCapsuleCapability.permissions).not.toContain("opener:allow-open-url");
    const buildScript = readFileSync(
      join(process.cwd(), "src-tauri", "build.rs"),
      "utf8",
    );
    expect(buildScript).toContain("AppManifest::new().commands(APP_COMMANDS)");
    expect(buildScript).toContain('"resolve_voice_agent_tool_approval"');
    expect(buildScript).toContain('"set_mcp_tool_grant"');
  });

  it("does not duplicate CSP delivery in index.html", () => {
    const indexHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");

    expect(indexHtml).not.toContain("http-equiv=\"Content-Security-Policy\"");
  });
});

describe("Desktop release metadata", () => {
  it("keeps the npm lockfile version aligned with the desktop package", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { version: string };
    const packageLock = JSON.parse(
      readFileSync(join(process.cwd(), "package-lock.json"), "utf8"),
    ) as { version: string; packages: { "": { version: string } } };

    expect(packageLock.version).toBe(packageJson.version);
    expect(packageLock.packages[""].version).toBe(packageJson.version);
  });

  it("keeps generated app-command permissions aligned with registration and window policy", () => {
    const libRs = readFileSync(
      join(process.cwd(), "src-tauri", "src", "lib.rs"),
      "utf8",
    );
    const commandsRs = readFileSync(
      join(process.cwd(), "src-tauri", "src", "commands", "mod.rs"),
      "utf8",
    );
    const buildRs = readFileSync(join(process.cwd(), "src-tauri", "build.rs"), "utf8");
    const mainCapability = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri", "capabilities", "main.json"), "utf8"),
    ) as { permissions: string[] };
    const voiceCapability = JSON.parse(
      readFileSync(
        join(process.cwd(), "src-tauri", "capabilities", "voice-capsule.json"),
        "utf8",
      ),
    ) as { permissions: string[] };

    const handler = libRs.slice(
      libRs.indexOf(".invoke_handler(tauri::generate_handler!["),
      libRs.indexOf("])\n        .run", libRs.indexOf(".invoke_handler")),
    );
    const registered = [...handler.matchAll(/commands::([a-z0-9_]+)/g)].map(
      (match) => match[1],
    );
    const manifestBlock = buildRs.slice(
      buildRs.indexOf("const APP_COMMANDS"),
      buildRs.indexOf("];"),
    );
    const manifested = [...manifestBlock.matchAll(/"([a-z0-9_]+)"/g)].map(
      (match) => match[1],
    );
    expect(manifested.sort()).toEqual(registered.sort());

    for (const command of registered) {
      expect(mainCapability.permissions).toContain(`allow-${command.replaceAll("_", "-")}`);
    }

    const capsulePolicyBlock = commandsRs.slice(
      commandsRs.indexOf("match command {"),
      commandsRs.indexOf("Some(CommandWindowPolicy::CapsuleAllowed)", commandsRs.indexOf("match command {")),
    );
    const capsuleCommands = [
      ...capsulePolicyBlock.matchAll(/"([a-z0-9_]+)"/g),
    ].map((match) => `allow-${match[1].replaceAll("_", "-")}`);
    expect(
      voiceCapability.permissions.filter((permission) => permission.startsWith("allow-")),
    ).toEqual(capsuleCommands);
  });

  it("pins and bundles the verified FlaUI MCP runtime", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
    ) as TauriConfig;
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const preparation = readFileSync(
      join(process.cwd(), "scripts", "ensure-mcp-runtime.mjs"),
      "utf8",
    );

    expect(config.bundle?.resources).toEqual(["resources/mcp/"]);
    expect(packageJson.scripts["tauri:dev"]).toContain("ensure-mcp-runtime.mjs");
    expect(packageJson.scripts.build).toContain("ensure-mcp-runtime.mjs");
    expect(preparation).toContain('const VERSION = "0.2.0"');
    expect(preparation).toContain(
      "6428bb38aef433d8754b48cbaaff4f1eca5e98c107e89b0ad90399a9fcb1a106",
    );
    expect(preparation).toContain(
      "1a00162fc1a7c3fac924dfc5702cd66deb51d3a9f6a870c1e339a3defb6e20a4",
    );
  });

  it("keeps the Microsoft Store package identity in its manifest", () => {
    const manifest = readFileSync(
      join(process.cwd(), "store", "Package.appxmanifest"),
      "utf8",
    );

    expect(manifest).toContain('Name="ContextGridTechnologies.Vaak"');
    expect(manifest).toContain('Publisher="CN=B20D8AD7-41D7-401F-B407-EA718E9EC445"');
    expect(manifest).toContain("<DisplayName>Vaak</DisplayName>");
    expect(manifest).toContain("<PublisherDisplayName>ContextGridTechnologies</PublisherDisplayName>");
    expect(manifest).toContain('Executable="$targetnametoken$.exe"');
  });

  it("provides one command to build the Microsoft Store package", () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["store:package"]).toContain(
      "cargo clean --release --package vaak-desktop",
    );
    expect(packageJson.scripts?.["store:package"]).toContain(
      "call tauri build --no-bundle",
    );
    expect(packageJson.scripts?.["store:package"]).toContain(
      "(if not exist store\\dist mkdir store\\dist)",
    );
    expect(packageJson.scripts?.["store:package"]).toContain(
      "(if exist store\\Vaak.msix del /Q store\\Vaak.msix)",
    );
    expect(packageJson.scripts?.["store:package"]).toContain("winapp package");
    expect(packageJson.scripts?.["store:package"]).toContain("tauri build --no-bundle");
  });

  it("uses a process-scoped log file so a concurrent launch cannot abort startup", () => {
    const libRs = readFileSync(
      join(process.cwd(), "src-tauri", "src", "lib.rs"),
      "utf8",
    );

    expect(libRs).toContain('format!("backend-{}", std::process::id())');
    expect(libRs).not.toContain('file_name: Some("backend".to_string())');
  });

  it("uses production package metadata and release build settings", () => {
    const cargoToml = readFileSync(join(process.cwd(), "src-tauri", "Cargo.toml"), "utf8");
    const libRs = readFileSync(join(process.cwd(), "src-tauri", "src", "lib.rs"), "utf8");
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
    expect(cargoToml).toContain("tauri-plugin-updater");
    expect(cargoToml).toContain("tauri-plugin-process");
    expect(libRs).not.toContain("tauri_plugin_updater::Builder::new().build()");
    expect(libRs).toContain("tauri_plugin_process::init()");
    expect(cargoToml).toContain("[profile.release]");
    expect(cargoToml).toContain('codegen-units = 1');
    expect(cargoToml).toContain('lto = true');
    expect(cargoToml).toContain('opt-level = "s"');
    expect(cargoToml).toContain('panic = "abort"');
    expect(cargoToml).toContain('strip = true');
    expect(rootGitignore).not.toContain("src-tauri/*.lock");

    expect(config.bundle).toMatchObject({
      active: true,
      createUpdaterArtifacts: false,
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
    expect(config.plugins?.updater).toBeUndefined();
    expect(config.bundle?.longDescription).toContain("bring your own model or API key");
    expect(config.bundle?.icon).toEqual([
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico",
    ]);
  });

  it("publishes the Windows installer and checksum from tagged releases", () => {
    const workflow = readFileSync(
      join(process.cwd(), "..", "..", ".github", "workflows", "desktop-release.yml"),
      "utf8",
    );
    const windowsJob = workflow.slice(
      workflow.indexOf("  windows-installer:"),
      workflow.indexOf("  macos-preview:"),
    );
    const macosJob = workflow.slice(workflow.indexOf("  macos-preview:"));

    expect(workflow).toContain("Vaak-Windows-Setup.exe");
    expect(workflow).toContain("Vaak-Windows-Setup.exe.sha256");
    expect(workflow).toContain("--no-sign --bundles nsis");
    expect(windowsJob).toContain("Install WinApp CLI");
    expect(windowsJob).toContain("microsoft/setup-WinAppCli@v0.1");
    expect(windowsJob).toContain("cargo metadata --locked --no-deps");
    expect(windowsJob).toContain('$storeVersion = "$tagVersion.0"');
    expect(windowsJob).toContain("npm --prefix apps/desktop run store:package");
    expect(windowsJob).toContain("Vaak-Microsoft-Store-MSIX");
    expect(macosJob).not.toContain("Install WinApp CLI");
    expect(workflow).not.toContain("latest.json");
    expect(workflow).not.toContain("Vaak-Windows-Setup.nsis.zip");
  });
});

describe("Desktop startup behavior", () => {
  it("registers Vaak to launch when the user signs in", () => {
    const cargoToml = readFileSync(join(process.cwd(), "src-tauri", "Cargo.toml"), "utf8");
    const libRs = readFileSync(join(process.cwd(), "src-tauri", "src", "lib.rs"), "utf8");

    expect(cargoToml).toContain("tauri-plugin-autostart");
    expect(libRs).toContain("tauri_plugin_autostart::init");
    expect(libRs).toContain("MacosLauncher::LaunchAgent");
    expect(libRs).toContain("apply_startup_launch_preference");
    expect(libRs).toContain("commands::get_system_settings");
    expect(libRs).toContain("commands::save_system_settings");
  });
});

function readPngSize(path: string): { width: number; height: number } {
  const file = readFileSync(path);

  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}
