import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("main Tauri capability", () => {
  it("allows the main window to listen for backend hotkey events", () => {
    const filePath = resolve(
      process.cwd(),
      "src-tauri/capabilities/main.json",
    );
    const capability = JSON.parse(readFileSync(filePath, "utf8")) as {
      permissions?: string[];
    };

    expect(capability.permissions).toContain("core:event:default");
  });
});
