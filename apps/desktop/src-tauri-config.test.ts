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
};

type TauriConfig = {
  identifier: string;
  productName: string;
  app: {
    windows: TauriWindowConfig[];
  };
};

describe("Tauri window configuration", () => {
  it("uses the Vaak app name and opens the main app at a production desktop size", () => {
    const config = JSON.parse(
      readFileSync(join(process.cwd(), "src-tauri", "tauri.conf.json"), "utf8"),
    ) as TauriConfig;

    const mainWindow = config.app.windows.find((window) => window.label === "main");

    expect(config.productName).toBe("Vaak");
    expect(config.identifier).toBe("ai.vaak.app");
    expect(mainWindow).toMatchObject({
      title: "Vaak",
      width: 1120,
      height: 760,
      minWidth: 960,
      minHeight: 680,
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

function readPngSize(path: string): { width: number; height: number } {
  const file = readFileSync(path);

  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
}
