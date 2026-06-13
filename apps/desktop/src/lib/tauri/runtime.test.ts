import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import {
  getVoiceCapsuleReadyChallenge,
  recordStartupCheckpoint,
  recordVoiceCapsuleReady,
} from "./runtime";

describe("runtime Tauri API", () => {
  it("records startup checkpoints through the backend", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("record_startup_checkpoint", undefined);

    await recordStartupCheckpoint({
      windowLabel: "main",
      checkpoint: "renderer_stability_hooks_installed",
      detail: "heartbeat_interval_ms=5000",
    });

    expectTauriCommand(tauri, "record_startup_checkpoint", {
      windowLabel: "main",
      checkpoint: "renderer_stability_hooks_installed",
      detail: "heartbeat_interval_ms=5000",
    });
  });

  it("loads and records typed voice capsule ready acknowledgements", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("get_voice_capsule_ready_challenge", {
      runId: "run-1",
      attemptId: "attempt-1",
      nonce: "nonce-1",
    });
    tauri.resolveCommand("record_voice_capsule_ready", undefined);

    await expect(getVoiceCapsuleReadyChallenge("renderer-1")).resolves.toEqual({
      runId: "run-1",
      attemptId: "attempt-1",
      nonce: "nonce-1",
    });
    expectTauriCommand(tauri, "get_voice_capsule_ready_challenge", {
      rendererInstanceId: "renderer-1",
    });
    await recordVoiceCapsuleReady({
      runId: "run-1",
      attemptId: "attempt-1",
      nonce: "nonce-1",
      rendererInstanceId: "renderer-1",
      sessionEnabled: true,
    });

    expectTauriCommand(tauri, "record_voice_capsule_ready", {
      runId: "run-1",
      attemptId: "attempt-1",
      nonce: "nonce-1",
      rendererInstanceId: "renderer-1",
      sessionEnabled: true,
    });
  });
});
