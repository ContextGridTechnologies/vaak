import { describe, expect, it } from "vitest";

import {
  AssemblyAiProviderPanel,
  AzureOpenAiProviderPanel,
  ElevenLabsProviderPanel,
  OpenAiProviderPanel,
  ProviderSelector,
  SpeechProviderSettings,
} from "./index";

describe("speech provider settings module", () => {
  it("exports the documented provider settings building blocks", () => {
    expect(SpeechProviderSettings).toEqual(expect.any(Function));
    expect(ProviderSelector).toEqual(expect.any(Function));
    expect(OpenAiProviderPanel).toEqual(expect.any(Function));
    expect(AzureOpenAiProviderPanel).toEqual(expect.any(Function));
    expect(AssemblyAiProviderPanel).toEqual(expect.any(Function));
    expect(ElevenLabsProviderPanel).toEqual(expect.any(Function));
  });
});
