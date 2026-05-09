import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("audio capture processor asset", () => {
  it("is shipped as a public worklet module for production builds", () => {
    const assetPath = resolve(process.cwd(), "public/audioCaptureProcessor.js");

    expect(existsSync(assetPath)).toBe(true);
  });
});
