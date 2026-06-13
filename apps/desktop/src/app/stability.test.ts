import { waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  createTauriCommandHarness,
  expectTauriCommand,
} from "@/test/tauri";

import { installRendererStabilityHooks } from "./stability";

describe("installRendererStabilityHooks", () => {
  it("records hook installation before renderer heartbeats", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("record_startup_checkpoint", undefined);
    tauri.resolveCommand("record_renderer_heartbeat", undefined);

    const cleanup = installRendererStabilityHooks("main");

    await waitFor(() => {
      expect(
        tauri.calls.some(
          (call) =>
            call.command === "record_startup_checkpoint" &&
            call.args?.windowLabel === "main" &&
            call.args?.checkpoint === "renderer_stability_hooks_installed" &&
            String(call.args?.detail).startsWith(
              "heartbeat_interval_ms=5000 rendererInstanceId=",
            ),
        ),
      ).toBe(true);
    });
    const heartbeat = tauri.calls.find(
      (call) => call.command === "record_renderer_heartbeat",
    );
    expect(heartbeat?.args).toEqual({
      windowLabel: "main",
      rendererInstanceId: expect.any(String),
    });

    cleanup();
  });

  it("uses one opaque renderer instance id for all heartbeats in a renderer load", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("record_startup_checkpoint", undefined);
    tauri.resolveCommand("record_renderer_heartbeat", undefined);

    const cleanup = installRendererStabilityHooks("voice-capsule");

    await waitFor(() => {
      expectTauriCommand(tauri, "record_renderer_heartbeat", {
        windowLabel: "voice-capsule",
        rendererInstanceId: expect.any(String),
      });
    });
    const heartbeat = tauri.calls.find(
      (call) => call.command === "record_renderer_heartbeat",
    );
    const rendererInstanceId = heartbeat?.args?.rendererInstanceId;

    expect(rendererInstanceId).toEqual(expect.any(String));
    expect(String(rendererInstanceId)).not.toContain("voice-capsule");
    expect(String(rendererInstanceId)).not.toContain("http");

    cleanup();
  });

  it("acknowledges backend reopen probes from the main renderer", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("record_startup_checkpoint", undefined);
    tauri.resolveCommand("record_renderer_heartbeat", undefined);

    const cleanup = installRendererStabilityHooks("main");

    await waitFor(() => {
      expect(tauri.listenerCount("vaak://renderer-reopen-probe")).toBe(1);
    });
    await tauri.emitEvent("vaak://renderer-reopen-probe", {
      source: "single-instance",
    });

    await waitFor(() => {
      expectTauriCommand(tauri, "record_startup_checkpoint", {
        windowLabel: "main",
        checkpoint: "renderer_reopen_ack",
        detail: "source=single-instance",
      });
    });

    cleanup();
  });

  it("does not acknowledge backend reopen probes from the voice capsule renderer", async () => {
    const tauri = createTauriCommandHarness();
    tauri.resolveCommand("record_startup_checkpoint", undefined);
    tauri.resolveCommand("record_renderer_heartbeat", undefined);

    const cleanup = installRendererStabilityHooks("voice-capsule");

    await waitFor(() => {
      expect(
        tauri.calls.some(
          (call) =>
            call.command === "record_startup_checkpoint" &&
            call.args?.windowLabel === "voice-capsule" &&
            call.args?.checkpoint === "renderer_stability_hooks_installed" &&
            String(call.args?.detail).startsWith(
              "heartbeat_interval_ms=5000 rendererInstanceId=",
            ),
        ),
      ).toBe(true);
    });
    expect(tauri.listenerCount("vaak://renderer-reopen-probe")).toBe(0);
    await tauri.emitEvent("vaak://renderer-reopen-probe", {
      source: "single-instance",
    });
    expect(
      tauri.calls.some(
        (call) =>
          call.command === "record_startup_checkpoint" &&
          call.args?.checkpoint === "renderer_reopen_ack",
      ),
    ).toBe(false);

    cleanup();
  });
});
