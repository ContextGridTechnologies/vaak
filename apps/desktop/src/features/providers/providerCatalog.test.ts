import { describe, expect, it } from "vitest";

import { providerCatalog } from "./providerCatalog";

describe("providerCatalog", () => {
  it("keeps provider ids unique and production provider metadata complete", () => {
    const ids = providerCatalog.map((provider) => provider.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "openai",
        "azure-openai",
        "assemblyai",
        "deepgram",
        "groq",
        "elevenlabs",
        "smallest",
      ]),
    );

    for (const provider of providerCatalog) {
      expect(provider.name.trim()).not.toHaveLength(0);
      expect(provider.description.trim()).not.toHaveLength(0);
      expect(provider.credentialLabel.trim()).not.toHaveLength(0);
      expect(provider.categories).toContain("speech-to-text");
    }
  });

  it("uses Vaak product positioning instead of clone language", () => {
    const publicCopy = providerCatalog
      .flatMap((provider) => [
        provider.name,
        provider.description,
        provider.credentialLabel,
        provider.modelHint ?? "",
      ])
      .join(" ")
      .toLowerCase();

    expect(publicCopy).not.toContain("superwhisper");
    expect(publicCopy).not.toContain("competitor clone");
  });
});
