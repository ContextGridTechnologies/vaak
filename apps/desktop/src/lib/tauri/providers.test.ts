import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import {
  type SpeechProviderId,
  getProviderConfig,
  getProviderStatus,
  getSelectedSpeechProvider,
  saveSpeechProviderSetup,
  testSpeechProvider,
  transcribeRecording,
} from "./providers";

describe("provider Tauri API", () => {
  it("supports assemblyai in typed speech provider flows", () => {
    const providerId: SpeechProviderId = "assemblyai";

    expect(providerId).toBe("assemblyai");
  });

  it("supports Smallest AI in typed speech provider flows", () => {
    const providerId: SpeechProviderId = "smallest";

    expect(providerId).toBe("smallest");
  });

  it("maps provider setup to the atomic backend command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("save_speech_provider_setup", {
      providerId: "azure-openai",
      configured: true,
      configComplete: true,
    });

    const result = await saveSpeechProviderSetup({
      providerId: "azure-openai",
      apiKey: "secret",
      config: {
        endpoint: "https://example.openai.azure.com",
        deploymentId: "gpt-4o-transcribe",
        apiVersion: "2025-04-01-preview",
      },
      activate: true,
    });

    expect(result.configComplete).toBe(true);
    expectTauriCommand(tauri, "save_speech_provider_setup", {
      providerId: "azure-openai",
      apiKey: "secret",
      config: {
        endpoint: "https://example.openai.azure.com",
        deploymentId: "gpt-4o-transcribe",
        apiVersion: "2025-04-01-preview",
      },
      activate: true,
    });
  });

  it("uses safe command arguments for provider reads", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_provider_status", {
      providerId: "openai",
      configured: false,
      configComplete: true,
    });
    tauri.resolveCommand("get_provider_config", null);
    tauri.resolveCommand("get_selected_speech_provider", "openai");

    await expect(getProviderStatus("openai")).resolves.toMatchObject({
      providerId: "openai",
    });
    await expect(getProviderConfig("azure-openai")).resolves.toBeNull();
    await expect(getSelectedSpeechProvider()).resolves.toBe("openai");

    expectTauriCommand(tauri, "get_provider_status", { providerId: "openai" });
    expectTauriCommand(tauri, "get_provider_config", {
      providerId: "azure-openai",
    });
    expectTauriCommand(tauri, "get_selected_speech_provider", undefined);
  });

  it("serializes audio blobs before transcription", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("transcribe_recording", {
      providerId: "openai",
      model: "gpt-4o-mini-transcribe",
      text: "hello",
      durationMs: null,
    });

    await transcribeRecording({
      providerId: "openai",
      audioBlob: new Blob([new Uint8Array([1, 2, 3])], {
        type: "audio/webm",
      }),
      language: "en",
      prompt: "names",
    });

    expectTauriCommand(tauri, "transcribe_recording", {
      providerId: "openai",
      audioBytes: [1, 2, 3],
      mimeType: "audio/webm",
      language: "en",
      prompt: "names",
      model: undefined,
    });
  });

  it("maps provider testing to the backend readiness command", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("test_speech_provider", {
      providerId: "azure-openai",
      configured: true,
      configComplete: true,
    });

    await expect(testSpeechProvider("azure-openai")).resolves.toMatchObject({
      providerId: "azure-openai",
      configured: true,
      configComplete: true,
    });

    expectTauriCommand(tauri, "test_speech_provider", {
      providerId: "azure-openai",
    });
  });

  it("serializes AssemblyAI transcription requests with the selected provider id", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("transcribe_recording", {
      providerId: "assemblyai",
      model: "universal-3-pro",
      text: "hello",
      durationMs: null,
    });

    await transcribeRecording({
      providerId: "assemblyai",
      audioBlob: new Blob([new Uint8Array([4, 5, 6])], {
        type: "audio/flac",
      }),
      language: "en",
      model: "universal-3-pro",
    });

    expectTauriCommand(tauri, "transcribe_recording", {
      providerId: "assemblyai",
      audioBytes: [4, 5, 6],
      mimeType: "audio/flac",
      language: "en",
      prompt: undefined,
      model: "universal-3-pro",
    });
  });
});
