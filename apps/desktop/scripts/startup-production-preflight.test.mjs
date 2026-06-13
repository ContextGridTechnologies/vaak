import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildRunManifest,
  capsuleSoakEvidenceSummary,
  evaluateProcessPrecondition,
  startupDetectedFromEvidence,
  failedStartupIterations,
  failedSuiteScenarios,
  parseArgs,
  processCleanupProof,
  processEvidenceItems,
  processNameForExecutable,
  readinessCheckpointsForOptions,
  runPreflightSuite,
  runDirectoryName,
  summarizeIteration,
  startupDetectionWarnings,
  startupRunIdFromProcessEvidence,
  waitForStartupDetection,
} from "./startup-production-preflight.mjs";

describe("startup production preflight script", () => {
  it("parses the production executable and evidence output options", () => {
    const options = parseArgs([
      "--exe",
      "C:\\Program Files\\Vaak\\Vaak.exe",
      "--iterations",
      "3",
      "--timeout-ms",
      "15000",
      "--out",
      "output/startup-loops",
      "--log-dir",
      "C:\\Users\\n\\AppData\\Local\\ai.vaak.desktop\\logs",
      "--scenario",
      "tray-reopen",
      "--require-voice-capsule",
      "--suite",
      "--soak-ms",
      "240000",
      "--allow-existing-process",
    ]);

    expect(options).toMatchObject({
      exe: "C:\\Program Files\\Vaak\\Vaak.exe",
      iterations: 3,
      timeoutMs: 15_000,
      outDir: expect.stringContaining("output"),
      logDir: "C:\\Users\\n\\AppData\\Local\\ai.vaak.desktop\\logs",
      scenario: "tray-reopen",
      requireVoiceCapsule: true,
      suite: true,
      soakMs: 240_000,
      allowExistingProcess: true,
    });
  });

  it("rejects unknown preflight scenarios", () => {
    expect(() => parseArgs(["--scenario", "unknown"])).toThrow(
      "--scenario must be one of cold-start, single-instance, tray-reopen, capsule-soak.",
    );
  });

  it("creates stable preflight run directory names", () => {
    expect(runDirectoryName(new Date("2026-06-13T10:11:12.345Z"))).toBe(
      "startup-preflight-2026-06-13T10-11-12-345Z",
    );
  });

  it("warns when no app log directory is provided for readiness detection", () => {
    expect(startupDetectionWarnings({ logDir: undefined })).toEqual([
      "--log-dir was not provided; release builds may only expose renderer heartbeat checkpoints in the app log directory.",
    ]);
    expect(startupDetectionWarnings({ logDir: "C:\\logs" })).toEqual([]);
  });

  it("summarizes process evidence without stdout or stderr contents", () => {
    const summary = summarizeIteration({
      iteration: 2,
      exe: "C:\\Vaak\\Vaak.exe",
      pid: 1234,
      startedAt: "2026-06-13T10:11:12.000Z",
      finishedAt: "2026-06-13T10:11:17.000Z",
      exitCode: null,
      signal: "SIGTERM",
      timedOut: true,
      stdoutFile: "iteration-002-stdout.txt",
      stderrFile: "iteration-002-stderr.txt",
      appLogFiles: ["backend.log"],
      appLogEvidenceFiles: ["iteration-002-app-backend.log.txt"],
      handoffPid: 5678,
      handoffExitCode: 0,
      handoffSignal: null,
      handoffTimedOut: false,
      handoffStdoutFile: "iteration-002-handoff-stdout.txt",
      handoffStderrFile: "iteration-002-handoff-stderr.txt",
      runManifest: {
        processName: "Vaak.exe",
        launchedPids: [1234, 5678],
        startupRunId: "run-2",
        processCleanup: {
          available: true,
          processName: "Vaak.exe",
          processCountBefore: 0,
          processCountAfter: 0,
          windowCountAfter: 0,
          visibleWindowCountAfter: 0,
          launchedPids: [1234, 5678],
          remainingLaunchedPids: [],
          passed: true,
          reason: null,
        },
      },
      startupDetected: true,
      startupDetectionSource: "backend.log",
      soakMs: 240_000,
      exitedDuringSoak: false,
      voiceCapsuleReadyAckDetected: true,
      voiceCapsuleHeartbeatCount: 48,
      staleVoiceCapsuleRecoveryDetected: false,
      rendererErrorDetected: false,
    });

    expect(summary).toEqual({
      iteration: 2,
      exe: "C:\\Vaak\\Vaak.exe",
      pid: 1234,
      startedAt: "2026-06-13T10:11:12.000Z",
      finishedAt: "2026-06-13T10:11:17.000Z",
      exitCode: null,
      signal: "SIGTERM",
      timedOut: true,
      stdoutFile: "iteration-002-stdout.txt",
      stderrFile: "iteration-002-stderr.txt",
      appLogFiles: ["backend.log"],
      appLogEvidenceFiles: ["iteration-002-app-backend.log.txt"],
      handoffPid: 5678,
      handoffExitCode: 0,
      handoffSignal: null,
      handoffTimedOut: false,
      handoffStdoutFile: "iteration-002-handoff-stdout.txt",
      handoffStderrFile: "iteration-002-handoff-stderr.txt",
      runManifest: {
        processName: "Vaak.exe",
        launchedPids: [1234, 5678],
        startupRunId: "run-2",
        processCleanup: {
          available: true,
          processName: "Vaak.exe",
          processCountBefore: 0,
          processCountAfter: 0,
          windowCountAfter: 0,
          visibleWindowCountAfter: 0,
          launchedPids: [1234, 5678],
          remainingLaunchedPids: [],
          passed: true,
          reason: null,
        },
      },
      startupDetected: true,
      startupDetectionSource: "backend.log",
      soakMs: 240_000,
      exitedDuringSoak: false,
      voiceCapsuleReadyAckDetected: true,
      voiceCapsuleHeartbeatCount: 48,
      staleVoiceCapsuleRecoveryDetected: false,
      rendererErrorDetected: false,
    });
  });

  it("derives a process name from the executable path for runner hygiene", () => {
    expect(processNameForExecutable("C:\\Program Files\\Vaak\\Vaak.exe")).toBe(
      "Vaak.exe",
    );
    expect(processNameForExecutable("")).toBe("unknown");
  });

  it("rejects startup loops when an existing app process is detected", () => {
    expect(
      evaluateProcessPrecondition(
        {
          available: true,
          processName: "Vaak.exe",
          processCount: 1,
          processes: [{ pid: 1111 }],
        },
        { exe: "C:\\Vaak\\Vaak.exe" },
      ),
    ).toEqual({
      available: true,
      processName: "Vaak.exe",
      processCount: 1,
      existingPids: [1111],
      allowExistingProcess: false,
      passed: false,
      unavailableReason: null,
      reason: "existing_process_detected",
    });

    expect(
      evaluateProcessPrecondition(
        {
          available: true,
          processName: "Vaak.exe",
          processCount: 1,
          processes: [{ pid: 1111 }],
        },
        {
          exe: "C:\\Vaak\\Vaak.exe",
          allowExistingProcess: true,
        },
      ).passed,
    ).toBe(true);
  });

  it("fails cleanup proof when a launched process remains after an iteration", () => {
    expect(
      processCleanupProof(
        {
          available: true,
          processName: "Vaak.exe",
          processCount: 0,
          processes: [],
        },
        {
          available: true,
          processName: "Vaak.exe",
          processCount: 1,
          windowCount: 2,
          visibleWindowCount: 1,
          processes: [
            {
              pid: 1234,
              name: "Vaak.exe",
              windowCount: 2,
              visibleWindowCount: 1,
            },
          ],
        },
        [1234],
      ),
    ).toEqual({
      available: true,
      processName: "Vaak.exe",
      processCountBefore: 0,
      processCountAfter: 1,
      windowCountAfter: 2,
      visibleWindowCountAfter: 1,
      launchedPids: [1234],
      remainingLaunchedPids: [1234],
      passed: false,
      reason: "launched_process_still_running",
    });
  });

  it("builds an iteration manifest with launched pid, handoff pid, run id, and cleanup proof", () => {
    expect(
      buildRunManifest({
        exe: "C:\\Vaak\\Vaak.exe",
        pid: 1234,
        handoffPid: 5678,
        startupRunId: "run-1",
        processCleanup: {
          available: true,
          launchedPids: [1234, 5678],
          remainingLaunchedPids: [],
          passed: true,
        },
      }),
    ).toEqual({
      processName: "Vaak.exe",
      launchedPids: [1234, 5678],
      startupRunId: "run-1",
      processCleanup: {
        available: true,
        launchedPids: [1234, 5678],
        remainingLaunchedPids: [],
        passed: true,
      },
    });
  });

  it("reports iterations without startup detection as failed preflight iterations", () => {
    expect(
      failedStartupIterations({
        results: [
          { iteration: 1, startupDetected: true },
          { iteration: 2, startupDetected: false },
        ],
      }),
    ).toEqual([2]);
  });

  it("runs the production startup suite across all startup scenarios", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "vaak-startup-suite-"));
    const calls = [];

    try {
      const summary = await runPreflightSuite(
        {
          exe: "C:\\Vaak\\Vaak.exe",
          iterations: 2,
          timeoutMs: 15_000,
          outDir,
          logDir: "C:\\logs",
          requireVoiceCapsule: true,
        },
        async (scenarioOptions) => {
          calls.push(scenarioOptions);
          return {
            outDir: path.join(scenarioOptions.outDir, "evidence"),
            results: [
              { iteration: 1, startupDetected: true },
              {
                iteration: 2,
                startupDetected: scenarioOptions.scenario !== "tray-reopen",
              },
            ],
          };
        },
      );

      expect(calls.map((call) => call.scenario)).toEqual([
        "cold-start",
        "single-instance",
        "tray-reopen",
      ]);
      expect(calls.every((call) => call.requireVoiceCapsule)).toBe(true);
      expect(summary.scenarios).toEqual([
        {
          scenario: "cold-start",
          outDir: expect.stringContaining("evidence"),
          summaryFile: expect.stringContaining("summary.json"),
          failedIterations: [],
          passed: true,
        },
        {
          scenario: "single-instance",
          outDir: expect.stringContaining("evidence"),
          summaryFile: expect.stringContaining("summary.json"),
          failedIterations: [],
          passed: true,
        },
        {
          scenario: "tray-reopen",
          outDir: expect.stringContaining("evidence"),
          summaryFile: expect.stringContaining("summary.json"),
          failedIterations: [2],
          passed: false,
        },
      ]);
      expect(failedSuiteScenarios(summary)).toEqual(["tray-reopen"]);

      const saved = JSON.parse(
        await readFile(path.join(summary.outDir, "summary.json"), "utf8"),
      );
      expect(saved.scenarios).toEqual(summary.scenarios);
    } finally {
      await rm(outDir, { force: true, recursive: true });
    }
  });

  it("records thrown scenario failures in the suite summary and keeps running", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "vaak-startup-suite-"));
    const calls = [];

    try {
      const summary = await runPreflightSuite(
        {
          exe: "C:\\Vaak\\Vaak.exe",
          iterations: 1,
          timeoutMs: 15_000,
          outDir,
          logDir: "C:\\logs",
          requireVoiceCapsule: false,
        },
        async (scenarioOptions) => {
          calls.push(scenarioOptions.scenario);
          if (scenarioOptions.scenario === "single-instance") {
            throw new Error("single instance launch failed");
          }
          return {
            outDir: path.join(scenarioOptions.outDir, "evidence"),
            results: [{ iteration: 1, startupDetected: true }],
          };
        },
      );

      expect(calls).toEqual(["cold-start", "single-instance", "tray-reopen"]);
      expect(summary.scenarios[1]).toEqual({
        scenario: "single-instance",
        outDir: expect.stringContaining("single-instance"),
        summaryFile: null,
        failedIterations: [],
        passed: false,
        error: "single instance launch failed",
      });
      expect(failedSuiteScenarios(summary)).toEqual(["single-instance"]);
    } finally {
      await rm(outDir, { force: true, recursive: true });
    }
  });

  it("uses process stdout and stderr only for active startup polling evidence", () => {
    expect(
      processEvidenceItems({
        stdoutChunks: [Buffer.from("out")],
        stderrChunks: [Buffer.from("err")],
        stdoutFile: "stdout.txt",
        stderrFile: "stderr.txt",
      }),
    ).toEqual([
      { source: "stdout.txt", text: "out" },
      { source: "stderr.txt", text: "err" },
    ]);
  });

  it("detects startup readiness from a main renderer heartbeat checkpoint", () => {
    const detection = startupDetectedFromEvidence([
      {
        source: "backend.log",
        text:
          "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1",
      },
    ]);

    expect(detection).toEqual({
      detected: true,
      source: "backend.log",
    });
  });

  it("detects main readiness from app shell checkpoints if early heartbeat logs are compacted", () => {
    const detection = startupDetectedFromEvidence([
      {
        source: "backend.log",
        text:
          "startup_checkpoint run_id=abc component=renderer window=main checkpoint=app_shell_preferences_loaded detail=sidebarCollapsed=false",
      },
    ]);

    expect(detection).toEqual({
      detected: true,
      source: "backend.log",
    });
  });

  it("does not treat voice capsule readiness as main renderer readiness", () => {
    const detection = startupDetectedFromEvidence([
      {
        source: "backend.log",
        text:
          "startup_checkpoint run_id=abc component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=1",
      },
    ]);

    expect(detection).toEqual({
      detected: false,
      source: null,
    });
  });

  it("finds the current startup run id from process stderr", () => {
    expect(
      startupRunIdFromProcessEvidence([
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=old component=renderer window=main checkpoint=renderer_heartbeat_received",
        },
        {
          source: "iteration-001-stderr.txt",
          text:
            "startup_checkpoint run_id=new component=backend checkpoint=runtime_config_loaded",
        },
      ]),
    ).toBe("new");
  });

  it("ignores stale app log checkpoints when a current run id is required", () => {
    const detection = startupDetectedFromEvidence(
      [
        {
          source: "iteration-001-stderr.txt",
          text:
            "startup_checkpoint run_id=new component=backend checkpoint=runtime_config_loaded",
        },
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=old component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1",
        },
      ],
      undefined,
      { requireProcessRunId: true },
    );

    expect(detection).toEqual({
      detected: false,
      source: null,
    });
  });

  it("detects app log checkpoints for the current process run id", () => {
    const detection = startupDetectedFromEvidence(
      [
        {
          source: "iteration-001-stderr.txt",
          text:
            "startup_checkpoint run_id=new component=backend checkpoint=runtime_config_loaded",
        },
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=old component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1\nstartup_checkpoint run_id=new component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1",
        },
      ],
      undefined,
      { requireProcessRunId: true },
    );

    expect(detection).toEqual({
      detected: true,
      source: "backend.log",
    });
  });

  it("requires voice capsule heartbeat, native visibility, on-screen bounds, and typed ready ack", () => {
    const checkpoints = readinessCheckpointsForOptions({
      scenario: "cold-start",
      requireVoiceCapsule: true,
    });

    expect(
      startupDetectedFromEvidence(
        [
          {
            source: "backend.log",
            text:
              "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1",
          },
        ],
        checkpoints,
      ),
    ).toEqual({
      detected: false,
      source: null,
    });

    expect(
      startupDetectedFromEvidence(
        [
          {
            source: "backend.log",
            text:
              "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1\nstartup_checkpoint run_id=abc component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=1",
          },
        ],
        checkpoints,
      ),
    ).toEqual({
      detected: false,
      source: null,
    });

    expect(
      startupDetectedFromEvidence(
        [
          {
            source: "backend.log",
            text:
              "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_visibility_checked detail=visible=true\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_bounds_checked detail=onScreen=true_x=692_y=800_width=56_height=36\nstartup_checkpoint run_id=abc component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=1_rendererInstanceId=renderer-1\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_ready_ack_received detail=sessionEnabled=true_attemptId=attempt-1_rendererInstanceId=renderer-1",
          },
        ],
        checkpoints,
      ),
    ).toEqual({
      detected: true,
      source: "backend.log",
    });
  });

  it("does not accept generic renderer voice capsule ready checkpoints for typed readiness", () => {
    const checkpoints = readinessCheckpointsForOptions({
      scenario: "cold-start",
      requireVoiceCapsule: true,
    });

    const detection = startupDetectedFromEvidence(
      [
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_visibility_checked detail=visible=true\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_bounds_checked detail=onScreen=true_x=692_y=800_width=56_height=36\nstartup_checkpoint run_id=abc component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=1\nstartup_checkpoint run_id=abc component=renderer window=voice-capsule checkpoint=voice_capsule_ready detail=sessionEnabled=true",
        },
      ],
      checkpoints,
    );

    expect(detection).toEqual({
      detected: false,
      source: null,
    });
  });

  it("rejects voice capsule readiness when heartbeat and ack use different renderer instances", () => {
    const checkpoints = readinessCheckpointsForOptions({
      scenario: "cold-start",
      requireVoiceCapsule: true,
    });

    const detection = startupDetectedFromEvidence(
      [
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_visibility_checked detail=visible=true\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_bounds_checked detail=onScreen=true_x=692_y=800_width=56_height=36\nstartup_checkpoint run_id=abc component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=1_rendererInstanceId=renderer-1\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_ready_ack_received detail=sessionEnabled=true_attemptId=attempt-1_rendererInstanceId=renderer-2",
        },
      ],
      checkpoints,
    );

    expect(detection).toEqual({
      detected: false,
      source: null,
    });
  });

  it("rejects recovery evidence when the ready ack belongs to an old attempt", () => {
    const checkpoints = readinessCheckpointsForOptions({
      scenario: "cold-start",
      requireVoiceCapsule: true,
    });

    const detection = startupDetectedFromEvidence(
      [
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_visibility_checked detail=visible=true\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_bounds_checked detail=onScreen=true_x=692_y=800_width=56_height=36\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_ready_ack_received detail=sessionEnabled=true_attemptId=attempt-old_rendererInstanceId=renderer-old\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_recovery_started detail=reason=stale_heartbeat_attemptId=attempt-new_previousRendererInstanceId=renderer-old_forcedReload=true\nstartup_checkpoint run_id=abc component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=2_rendererInstanceId=renderer-new",
        },
      ],
      checkpoints,
    );

    expect(detection).toEqual({
      detected: false,
      source: null,
    });
  });

  it("rejects forced-reload recovery evidence when the renderer instance did not change", () => {
    const checkpoints = readinessCheckpointsForOptions({
      scenario: "cold-start",
      requireVoiceCapsule: true,
    });

    const detection = startupDetectedFromEvidence(
      [
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_visibility_checked detail=visible=true\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_bounds_checked detail=onScreen=true_x=692_y=800_width=56_height=36\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_recovery_started detail=reason=stale_heartbeat_attemptId=attempt-new_previousRendererInstanceId=renderer-1_forcedReload=true\nstartup_checkpoint run_id=abc component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=2_rendererInstanceId=renderer-1\nstartup_checkpoint run_id=abc component=backend checkpoint=voice_capsule_ready_ack_received detail=sessionEnabled=true_attemptId=attempt-new_rendererInstanceId=renderer-1",
        },
      ],
      checkpoints,
    );

    expect(detection).toEqual({
      detected: false,
      source: null,
    });
  });

  it("does not accept single-instance handoff evidence without renderer reopen ack", () => {
    const checkpoints = readinessCheckpointsForOptions({
      scenario: "single-instance",
      requireVoiceCapsule: false,
    });

    const detection = startupDetectedFromEvidence(
      [
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1\nstartup_checkpoint run_id=abc component=backend checkpoint=single_instance_reopen_requested",
        },
      ],
      checkpoints,
    );

    expect(detection).toEqual({
      detected: false,
      source: null,
    });
  });

  it("summarizes capsule soak evidence from current-run heartbeats and failures", () => {
    const healthy = capsuleSoakEvidenceSummary(
      [
        {
          source: "stderr.txt",
          text:
            "startup_checkpoint run_id=new component=backend checkpoint=runtime_config_loaded",
        },
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=old component=backend checkpoint=voice_capsule_ready_ack_received detail=sessionEnabled=true_attemptId=attempt-old_rendererInstanceId=renderer-old\nstartup_checkpoint run_id=old component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=600_rendererInstanceId=renderer-old\nstartup_checkpoint run_id=new component=backend checkpoint=voice_capsule_ready_ack_received detail=sessionEnabled=true_attemptId=attempt-new_rendererInstanceId=renderer-new\nstartup_checkpoint run_id=new component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=288_rendererInstanceId=renderer-new",
        },
      ],
      {
        minHeartbeatCount: 240,
        requireProcessRunId: true,
      },
    );

    expect(healthy).toEqual({
      runId: "new",
      voiceCapsuleReadyAckDetected: true,
      voiceCapsuleHeartbeatCount: 288,
      staleVoiceCapsuleRecoveryDetected: false,
      rendererErrorDetected: false,
      passed: true,
    });

    const unhealthy = capsuleSoakEvidenceSummary(
      [
        {
          source: "stderr.txt",
          text:
            "startup_checkpoint run_id=new component=backend checkpoint=runtime_config_loaded",
        },
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=new component=backend checkpoint=voice_capsule_ready_ack_received detail=sessionEnabled=true_attemptId=attempt-new_rendererInstanceId=renderer-new\nstartup_checkpoint run_id=new component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=12_rendererInstanceId=renderer-new\nstartup_checkpoint run_id=new component=backend checkpoint=voice_capsule_stale_recovery_started",
        },
      ],
      {
        minHeartbeatCount: 240,
        requireProcessRunId: true,
      },
    );

    expect(unhealthy).toMatchObject({
      runId: "new",
      voiceCapsuleReadyAckDetected: true,
      voiceCapsuleHeartbeatCount: 12,
      staleVoiceCapsuleRecoveryDetected: true,
      passed: false,
    });
  });

  it("requires renderer reopen ack for single-instance handoff readiness", () => {
    const checkpoints = readinessCheckpointsForOptions({
      scenario: "single-instance",
      requireVoiceCapsule: false,
    });

    const detection = startupDetectedFromEvidence(
      [
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=abc component=renderer window=main checkpoint=app_shell_mounted\nstartup_checkpoint run_id=abc component=backend checkpoint=single_instance_main_window_reopen_completed\nstartup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_reopen_ack detail=source=single-instance",
        },
      ],
      checkpoints,
    );

    expect(detection).toEqual({
      detected: true,
      source: "backend.log",
    });
  });

  it("does not treat backend setup alone as startup readiness", () => {
    const detection = startupDetectedFromEvidence([
      {
        source: "backend.log",
        text:
          "startup_checkpoint run_id=abc component=backend checkpoint=renderer_watchdog_started",
      },
    ]);

    expect(detection).toEqual({
      detected: false,
      source: null,
    });
  });

  it("waits until startup readiness evidence appears", async () => {
    const evidenceByAttempt = [
      [
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=abc component=backend checkpoint=renderer_watchdog_started",
        },
      ],
      [
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=abc component=renderer window=main checkpoint=renderer_heartbeat_received detail=count=1",
        },
      ],
    ];
    let attempts = 0;

    const detection = await waitForStartupDetection(
      async () => evidenceByAttempt[Math.min(attempts++, 1)],
      1_000,
      0,
    );

    expect(detection).toEqual({
      detected: true,
      source: "backend.log",
    });
    expect(attempts).toBe(2);
  });

  it("returns an explicit miss when startup readiness never appears", async () => {
    const detection = await waitForStartupDetection(
      async () => [
        {
          source: "backend.log",
          text:
            "startup_checkpoint run_id=abc component=backend checkpoint=setup_started",
        },
      ],
      0,
      0,
    );

    expect(detection).toEqual({
      detected: false,
      source: null,
    });
  });
});
