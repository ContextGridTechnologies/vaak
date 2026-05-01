import { describe, expect, it } from "vitest";

import {
  AzureOpenAiProviderPanel,
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
  });
});
