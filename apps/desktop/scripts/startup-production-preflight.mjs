import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const defaultOutDir = path.join(repoRoot, "output", "startup-loops");
const defaultSoakMs = 4 * 60 * 60 * 1000;
const processCleanupTimeoutMs = 3_000;
const mainReadyCheckpoints = [
  "component=renderer window=main checkpoint=renderer_heartbeat_received",
  "component=renderer window=main checkpoint=app_shell_mounted",
  "component=renderer window=main checkpoint=app_shell_preferences_loaded",
  "component=renderer window=main checkpoint=app_shell_preferences_failed",
];
const voiceCapsuleReadyCheckpoints = [
  "component=backend checkpoint=voice_capsule_visibility_checked detail=visible=true",
  "component=backend checkpoint=voice_capsule_bounds_checked detail=onScreen=true",
  "component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received",
  "component=backend checkpoint=voice_capsule_ready_ack_received",
];
const singleInstanceReadyCheckpoints = [
  "component=backend checkpoint=single_instance_reopen_requested",
  "component=backend checkpoint=single_instance_main_window_found",
  "component=backend checkpoint=single_instance_main_window_reopen_completed",
];
const rendererReopenAckCheckpoints = [
  "component=renderer window=main checkpoint=renderer_reopen_ack",
];
const trayHiddenCheckpoints = [
  "component=backend checkpoint=main_window_hidden_to_tray",
];
const scenarioNames = new Set([
  "cold-start",
  "single-instance",
  "tray-reopen",
  "capsule-soak",
]);
const startupSuiteScenarios = ["cold-start", "single-instance", "tray-reopen"];

export function parseArgs(argv) {
  const options = {
    exe: undefined,
    iterations: 1,
    timeoutMs: 20_000,
    outDir: defaultOutDir,
    logDir: undefined,
    scenario: "cold-start",
    requireVoiceCapsule: false,
    suite: false,
    soakMs: defaultSoakMs,
    allowExistingProcess: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--exe") {
      options.exe = argv[++index];
    } else if (arg === "--iterations") {
      options.iterations = parsePositiveInt(argv[++index], "--iterations");
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = parsePositiveInt(argv[++index], "--timeout-ms");
    } else if (arg === "--soak-ms") {
      options.soakMs = parsePositiveInt(argv[++index], "--soak-ms");
    } else if (arg === "--out") {
      options.outDir = path.resolve(
        process.cwd(),
        argv[++index] ?? options.outDir,
      );
    } else if (arg === "--log-dir") {
      options.logDir = argv[++index];
    } else if (arg === "--scenario") {
      options.scenario = parseScenario(argv[++index]);
    } else if (arg === "--require-voice-capsule") {
      options.requireVoiceCapsule = true;
    } else if (arg === "--suite") {
      options.suite = true;
    } else if (arg === "--allow-existing-process") {
      options.allowExistingProcess = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

export function runDirectoryName(date = new Date()) {
  return `startup-preflight-${date.toISOString().replace(/[:.]/g, "-")}`;
}

export function startupDetectionWarnings(options) {
  if (options.logDir) {
    return [];
  }

  return [
    "--log-dir was not provided; release builds may only expose renderer heartbeat checkpoints in the app log directory.",
  ];
}

export function processNameForExecutable(exe) {
  const value = exe ?? "";
  const processName = (value.includes("\\")
    ? path.win32.basename(value)
    : path.basename(value)
  ).trim();
  return processName.length > 0 ? processName : "unknown";
}

export function evaluateProcessPrecondition(snapshot, options = {}) {
  const processCount = snapshot?.processCount ?? null;
  const existingPids = snapshot?.processes?.map((processInfo) => processInfo.pid) ?? [];
  const available = snapshot?.available === true;
  const allowExistingProcess = options.allowExistingProcess === true;
  const passed = available && (allowExistingProcess || processCount === 0);

  return {
    available,
    processName: snapshot?.processName ?? processNameForExecutable(options.exe),
    processCount,
    existingPids,
    allowExistingProcess,
    passed,
    unavailableReason: available ? null : (snapshot?.reason ?? "unknown"),
    reason: passed
      ? null
      : available
        ? "existing_process_detected"
        : "process_snapshot_unavailable",
  };
}

export function processCleanupProof(beforeSnapshot, afterSnapshot, launchedPids) {
  const normalizedLaunchedPids = launchedPids
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  const afterProcesses = afterSnapshot?.processes ?? [];
  const remainingLaunchedPids = afterProcesses
    .filter((processInfo) => normalizedLaunchedPids.includes(processInfo.pid))
    .map((processInfo) => processInfo.pid);
  const available = afterSnapshot?.available === true;
  const passed =
    available &&
    normalizedLaunchedPids.length > 0 &&
    remainingLaunchedPids.length === 0;

  return {
    available,
    processName: afterSnapshot?.processName ?? beforeSnapshot?.processName ?? "unknown",
    processCountBefore: beforeSnapshot?.processCount ?? null,
    processCountAfter: afterSnapshot?.processCount ?? null,
    windowCountAfter: afterSnapshot?.windowCount ?? "unavailable",
    visibleWindowCountAfter: afterSnapshot?.visibleWindowCount ?? "unavailable",
    launchedPids: normalizedLaunchedPids,
    remainingLaunchedPids,
    passed,
    reason: passed
      ? null
      : available
        ? "launched_process_still_running"
        : "process_snapshot_unavailable",
  };
}

export function buildRunManifest({
  exe,
  pid,
  handoffPid,
  startupRunId,
  processCleanup,
}) {
  const launchedPids = [pid, handoffPid].filter((value) =>
    Number.isInteger(value) && value > 0,
  );

  return {
    processName: processNameForExecutable(exe),
    launchedPids,
    startupRunId: startupRunId ?? null,
    processCleanup,
  };
}

export function summarizeIteration(input) {
  return {
    iteration: input.iteration,
    exe: input.exe,
    pid: input.pid,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    exitCode: input.exitCode,
    signal: input.signal,
    timedOut: input.timedOut,
    stdoutFile: input.stdoutFile,
    stderrFile: input.stderrFile,
    appLogFiles: input.appLogFiles,
    appLogEvidenceFiles: input.appLogEvidenceFiles ?? [],
    handoffPid: input.handoffPid ?? null,
    handoffExitCode: input.handoffExitCode ?? null,
    handoffSignal: input.handoffSignal ?? null,
    handoffTimedOut: input.handoffTimedOut ?? false,
    handoffStdoutFile: input.handoffStdoutFile ?? null,
    handoffStderrFile: input.handoffStderrFile ?? null,
    runManifest: input.runManifest ?? null,
    startupDetected: input.startupDetected,
    startupDetectionSource: input.startupDetectionSource,
    ...(input.soakMs === undefined
      ? {}
      : {
          soakMs: input.soakMs,
          exitedDuringSoak: input.exitedDuringSoak ?? false,
          voiceCapsuleReadyAckDetected:
            input.voiceCapsuleReadyAckDetected ?? false,
          voiceCapsuleHeartbeatCount: input.voiceCapsuleHeartbeatCount ?? 0,
          staleVoiceCapsuleRecoveryDetected:
            input.staleVoiceCapsuleRecoveryDetected ?? false,
          rendererErrorDetected: input.rendererErrorDetected ?? false,
        }),
  };
}

export function failedStartupIterations(summary) {
  return summary.results
    .filter((result) => !result.startupDetected)
    .map((result) => result.iteration);
}

export function failedSuiteScenarios(summary) {
  return summary.scenarios
    .filter((scenario) => !scenario.passed)
    .map((scenario) => scenario.scenario);
}

export function processEvidenceItems({
  stdoutChunks,
  stderrChunks,
  stdoutFile,
  stderrFile,
}) {
  return [
    { source: stdoutFile, text: Buffer.concat(stdoutChunks).toString("utf8") },
    { source: stderrFile, text: Buffer.concat(stderrChunks).toString("utf8") },
  ];
}

export function readinessCheckpointsForOptions(options = {}) {
  const checkpoints = [mainReadyCheckpoints];

  if (options.requireVoiceCapsule) {
    checkpoints.push(...voiceCapsuleReadyCheckpoints);
  }
  if (options.scenario === "single-instance" || options.scenario === "tray-reopen") {
    checkpoints.push(singleInstanceReadyCheckpoints);
    checkpoints.push(rendererReopenAckCheckpoints);
  }

  return checkpoints;
}

export function startupDetectedFromEvidence(
  evidence,
  requiredCheckpoints = [mainReadyCheckpoints],
  options = {},
) {
  const runId =
    options.runId ??
    (options.requireProcessRunId
      ? startupRunIdFromProcessEvidence(evidence)
      : null);
  if (options.requireProcessRunId && !runId) {
    return {
      detected: false,
      source: null,
    };
  }

  const searchableEvidence = runId ? evidenceForRunId(evidence, runId) : evidence;
  const checkpointGroups = requiredCheckpoints.map((checkpoint) =>
    Array.isArray(checkpoint) ? checkpoint : [checkpoint],
  );
  const missingCheckpoint = checkpointGroups.find(
    (group) =>
      !searchableEvidence.some((item) =>
        group.some((checkpoint) => item.text.includes(checkpoint)),
      ),
  );
  const match = searchableEvidence.find((item) =>
    checkpointGroups.some((group) =>
      group.some((checkpoint) => item.text.includes(checkpoint)),
    ),
  );
  const voiceCapsuleEvidence = requiresVoiceCapsuleAttemptEvidence(checkpointGroups)
    ? voiceCapsuleAttemptEvidence(searchableEvidence)
    : { detected: true };

  return {
    detected: !missingCheckpoint && voiceCapsuleEvidence.detected,
    source:
      missingCheckpoint || !voiceCapsuleEvidence.detected
        ? null
        : (match?.source ?? null),
  };
}

export function startupRunIdFromProcessEvidence(evidence) {
  for (const item of evidence) {
    if (!item.source.includes("stdout") && !item.source.includes("stderr")) {
      continue;
    }

    const match = item.text.match(/startup_checkpoint run_id=([^ \r\n]+)/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

export function capsuleSoakEvidenceSummary(evidence, options = {}) {
  const runId =
    options.runId ??
    (options.requireProcessRunId
      ? startupRunIdFromProcessEvidence(evidence)
      : null);
  const searchableEvidence = runId ? evidenceForRunId(evidence, runId) : evidence;
  const text = searchableEvidence.map((item) => item.text).join("\n");
  const heartbeatCounts = [...text.matchAll(/window=voice-capsule checkpoint=renderer_heartbeat_received detail=count=(\d+)/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);
  const voiceCapsuleHeartbeatCount =
    heartbeatCounts.length > 0 ? Math.max(...heartbeatCounts) : 0;
  const voiceCapsuleReadyAckDetected = text.includes(
    "component=backend checkpoint=voice_capsule_ready_ack_received",
  ) && voiceCapsuleAttemptEvidence(searchableEvidence).detected;
  const staleVoiceCapsuleRecoveryDetected = text.includes(
    "component=backend checkpoint=voice_capsule_stale_recovery_started",
  ) || text.includes(
    "component=backend checkpoint=voice_capsule_recovery_started",
  );
  const rendererErrorDetected = text.includes(
    "window=voice-capsule checkpoint=renderer_error_reported",
  );
  const minHeartbeatCount = options.minHeartbeatCount ?? 1;

  return {
    runId,
    voiceCapsuleReadyAckDetected,
    voiceCapsuleHeartbeatCount,
    staleVoiceCapsuleRecoveryDetected,
    rendererErrorDetected,
    passed:
      voiceCapsuleReadyAckDetected &&
      voiceCapsuleHeartbeatCount >= minHeartbeatCount &&
      !staleVoiceCapsuleRecoveryDetected &&
      !rendererErrorDetected,
  };
}

function requiresVoiceCapsuleAttemptEvidence(checkpointGroups) {
  return checkpointGroups.some((group) =>
    group.some((checkpoint) =>
      checkpoint.includes("checkpoint=voice_capsule_ready_ack_received"),
    ),
  );
}

function voiceCapsuleAttemptEvidence(evidence) {
  const lines = evidence
    .flatMap((item) => item.text.split(/\r?\n/).map((line) => ({ line, source: item.source })))
    .filter((item) => item.line.includes("startup_checkpoint"));
  const latestRecovery = lines
    .map((item, index) => ({ ...item, index }))
    .filter((item) =>
      item.line.includes("component=backend checkpoint=voice_capsule_recovery_started"),
    )
    .at(-1);
  const requiredAttemptId = latestRecovery
    ? checkpointField(latestRecovery.line, "attemptId")
    : null;
  const previousRendererInstanceId = latestRecovery
    ? checkpointField(latestRecovery.line, "previousRendererInstanceId")
    : null;
  const forcedReload = latestRecovery
    ? checkpointField(latestRecovery.line, "forcedReload") === "true"
    : false;
  const minIndex = latestRecovery?.index ?? -1;
  const heartbeats = lines
    .map((item, index) => ({ ...item, index }))
    .filter(
      (item) =>
        item.index > minIndex &&
        item.line.includes(
          "component=renderer window=voice-capsule checkpoint=renderer_heartbeat_received",
        ),
    )
    .map((item) => ({
      rendererInstanceId: checkpointField(item.line, "rendererInstanceId"),
      index: item.index,
    }))
    .filter((item) => item.rendererInstanceId);
  const acks = lines
    .map((item, index) => ({ ...item, index }))
    .filter(
      (item) =>
        item.index > minIndex &&
        item.line.includes("component=backend checkpoint=voice_capsule_ready_ack_received"),
    )
    .map((item) => ({
      attemptId: checkpointField(item.line, "attemptId"),
      rendererInstanceId: checkpointField(item.line, "rendererInstanceId"),
      sessionEnabled: checkpointField(item.line, "sessionEnabled"),
      index: item.index,
    }))
    .filter(
      (item) =>
        item.attemptId &&
        item.rendererInstanceId &&
        item.sessionEnabled === "true" &&
        (!requiredAttemptId || item.attemptId === requiredAttemptId),
    );

  for (const ack of acks) {
    const matchingHeartbeat = heartbeats.find(
      (heartbeat) =>
        heartbeat.rendererInstanceId === ack.rendererInstanceId,
    );
    if (!matchingHeartbeat) {
      continue;
    }
    if (
      forcedReload &&
      previousRendererInstanceId &&
      previousRendererInstanceId !== "none" &&
      ack.rendererInstanceId === previousRendererInstanceId
    ) {
      continue;
    }

    return {
      detected: true,
      attemptId: ack.attemptId,
      rendererInstanceId: ack.rendererInstanceId,
    };
  }

  return {
    detected: false,
    attemptId: null,
    rendererInstanceId: null,
  };
}

function checkpointField(line, field) {
  const match = line.match(new RegExp(`${field}=([^_\\s]+)`));
  return match?.[1] ?? null;
}

function evidenceForRunId(evidence, runId) {
  const runIdMarker = `run_id=${runId}`;

  return evidence.map((item) => ({
    source: item.source,
    text: item.text
      .split(/\r?\n/)
      .filter((line) => line.includes(runIdMarker))
      .join("\n"),
  }));
}

export async function waitForStartupDetection(
  readEvidence,
  timeoutMs,
  pollMs = 250,
  requiredCheckpoints = [mainReadyCheckpoints],
  detectionOptions = {},
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const detection = startupDetectedFromEvidence(
      await readEvidence(),
      requiredCheckpoints,
      detectionOptions,
    );
    if (detection.detected) {
      return detection;
    }

    await sleep(pollMs);
  }

  return {
    detected: false,
    source: null,
  };
}

export async function runPreflight(options) {
  if (!options.exe) {
    throw new Error("Missing --exe path to the production Vaak executable.");
  }

  const runDir = path.join(options.outDir, runDirectoryName());
  await mkdir(runDir, { recursive: true });
  const initialProcessSnapshot = await processSnapshotForExe(options.exe);
  const initialProcessPrecondition = evaluateProcessPrecondition(
    initialProcessSnapshot,
    options,
  );

  const summary = {
    script: "startup-production-preflight",
    exe: options.exe,
    iterations: options.iterations,
    timeoutMs: options.timeoutMs,
    outDir: runDir,
    logDir: options.logDir,
    scenario: options.scenario,
    requireVoiceCapsule: options.requireVoiceCapsule,
    diagnosticsStderr: true,
    startedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    warnings: startupDetectionWarnings(options),
    processPrecondition: initialProcessPrecondition,
    results: [],
  };

  if (!initialProcessPrecondition.passed) {
    await writeJson(path.join(runDir, "summary.json"), summary);
    throw new Error(
      initialProcessPrecondition.reason === "existing_process_detected"
        ? `${initialProcessPrecondition.processName} is already running; close it or pass --allow-existing-process.`
        : `Process hygiene checks are unavailable for ${initialProcessPrecondition.processName}.`,
    );
  }

  for (let iteration = 1; iteration <= options.iterations; iteration += 1) {
    const iterationProcessPrecondition = evaluateProcessPrecondition(
      await processSnapshotForExe(options.exe),
      options,
    );
    if (!iterationProcessPrecondition.passed) {
      summary.results.push({
        iteration,
        startupDetected: false,
        startupDetectionSource: null,
        processPrecondition: iterationProcessPrecondition,
      });
      await writeJson(path.join(runDir, "summary.json"), summary);
      throw new Error(
        `${iterationProcessPrecondition.processName} is still running before iteration ${iteration}.`,
      );
    }
    const result = await runIteration(options, runDir, iteration);
    summary.results.push(result);
    await writeJson(path.join(runDir, "summary.json"), summary);
  }

  summary.finishedAt = new Date().toISOString();
  await writeJson(path.join(runDir, "summary.json"), summary);
  return summary;
}

export async function runPreflightSuite(options, runScenario = runPreflight) {
  if (!options.exe) {
    throw new Error("Missing --exe path to the production Vaak executable.");
  }

  const suiteRunDir = path.join(options.outDir, `startup-suite-${runDirectoryName()}`);
  await mkdir(suiteRunDir, { recursive: true });

  const summary = {
    script: "startup-production-preflight-suite",
    exe: options.exe,
    iterations: options.iterations,
    timeoutMs: options.timeoutMs,
    outDir: suiteRunDir,
    logDir: options.logDir,
    requireVoiceCapsule: options.requireVoiceCapsule,
    diagnosticsStderr: true,
    startedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    warnings: startupDetectionWarnings(options),
    scenarios: [],
  };

  for (const scenario of startupSuiteScenarios) {
    const scenarioOutDir = path.join(suiteRunDir, scenario);
    try {
      const scenarioSummary = await runScenario({
        ...options,
        suite: false,
        scenario,
        outDir: scenarioOutDir,
      });
      const failedIterations = failedStartupIterations(scenarioSummary);
      summary.scenarios.push({
        scenario,
        outDir: scenarioSummary.outDir,
        summaryFile: path.relative(
          suiteRunDir,
          path.join(scenarioSummary.outDir, "summary.json"),
        ),
        failedIterations,
        passed: failedIterations.length === 0,
      });
    } catch (error) {
      summary.scenarios.push({
        scenario,
        outDir: scenarioOutDir,
        summaryFile: null,
        failedIterations: [],
        passed: false,
        error: errorMessage(error),
      });
    }
    await writeJson(path.join(suiteRunDir, "summary.json"), summary);
  }

  summary.finishedAt = new Date().toISOString();
  await writeJson(path.join(suiteRunDir, "summary.json"), summary);
  return summary;
}

async function runIteration(options, runDir, iteration) {
  if (options.scenario === "capsule-soak") {
    return runCapsuleSoakIteration(options, runDir, iteration);
  }
  if (options.scenario === "single-instance" || options.scenario === "tray-reopen") {
    return runSingleInstanceIteration(options, runDir, iteration);
  }

  const processSnapshotBefore = await processSnapshotForExe(options.exe);
  const startedAt = new Date().toISOString();
  const stdoutChunks = [];
  const stderrChunks = [];
  const requiredCheckpoints = readinessCheckpointsForOptions(options);
  const child = spawn(options.exe, [], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: startupProcessEnv(),
  });

  child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  let timedOut = false;
  const exitPromise = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => resolve({ exitCode, signal }));
  });

  let startupDetection = {
    detected: false,
    source: null,
  };
  let exitResult;
  try {
    const result = await Promise.race([
      exitPromise.then((value) => ({ kind: "exit", value })),
      waitForStartupDetection(
        () =>
          iterationEvidence({
            stdoutChunks,
            stderrChunks,
            stdoutFile: `iteration-${String(iteration).padStart(3, "0")}-stdout.txt`,
            stderrFile: `iteration-${String(iteration).padStart(3, "0")}-stderr.txt`,
            logDir: options.logDir,
            includeAppLogs: false,
          }),
        options.timeoutMs,
        250,
        requiredCheckpoints,
        { requireProcessRunId: true },
      ).then((value) => ({ kind: "startup", value })),
      sleep(options.timeoutMs).then(() => ({ kind: "timeout" })),
    ]);

    if (result.kind === "startup" && result.value.detected) {
      startupDetection = result.value;
      child.kill();
      exitResult = await exitPromise;
    } else if (result.kind === "startup" || result.kind === "timeout") {
      timedOut = true;
      child.kill();
      exitResult = await exitPromise;
    } else {
      exitResult = result.value;
      startupDetection = startupDetectedFromEvidence(
        await iterationEvidence({
          stdoutChunks,
          stderrChunks,
          stdoutFile: `iteration-${String(iteration).padStart(3, "0")}-stdout.txt`,
          stderrFile: `iteration-${String(iteration).padStart(3, "0")}-stderr.txt`,
          logDir: options.logDir,
        }),
        requiredCheckpoints,
        { requireProcessRunId: true },
      );
    }
  } finally {
    if (!child.killed) {
      child.kill();
    }
  }

  const suffix = String(iteration).padStart(3, "0");
  const stdoutFile = `iteration-${suffix}-stdout.txt`;
  const stderrFile = `iteration-${suffix}-stderr.txt`;
  const stdoutBuffer = Buffer.concat(stdoutChunks);
  const stderrBuffer = Buffer.concat(stderrChunks);
  await writeFile(path.join(runDir, stdoutFile), stdoutBuffer);
  await writeFile(path.join(runDir, stderrFile), stderrBuffer);
  const appLogEvidence = await appLogEvidenceItems(options.logDir);
  const appLogEvidenceFiles = await writeAppLogEvidenceFiles(
    runDir,
    suffix,
    appLogEvidence,
  );
  if (!startupDetection.detected) {
    startupDetection = startupDetectedFromEvidence(
      [
        { source: stdoutFile, text: stdoutBuffer.toString("utf8") },
        { source: stderrFile, text: stderrBuffer.toString("utf8") },
        ...appLogEvidence,
      ],
      requiredCheckpoints,
      { requireProcessRunId: true },
    );
  }
  const finalEvidence = [
    { source: stdoutFile, text: stdoutBuffer.toString("utf8") },
    { source: stderrFile, text: stderrBuffer.toString("utf8") },
    ...appLogEvidence,
  ];
  const processCleanup = await waitForProcessCleanup(
    options.exe,
    processSnapshotBefore,
    [child.pid ?? null],
  );

  const summary = summarizeIteration({
    iteration,
    exe: options.exe,
    pid: child.pid ?? null,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: exitResult.exitCode,
    signal: exitResult.signal,
    timedOut,
    stdoutFile,
    stderrFile,
    appLogFiles: appLogEvidence.map((item) => item.source),
    appLogEvidenceFiles,
    runManifest: buildRunManifest({
      exe: options.exe,
      pid: child.pid ?? null,
      handoffPid: null,
      startupRunId: startupRunIdFromProcessEvidence(finalEvidence),
      processCleanup,
    }),
    startupDetected: startupDetection.detected && processCleanup.passed,
    startupDetectionSource: startupDetection.source,
  });
  await writeJson(path.join(runDir, `iteration-${suffix}.json`), summary);
  return summary;
}

async function runCapsuleSoakIteration(options, runDir, iteration) {
  const processSnapshotBefore = await processSnapshotForExe(options.exe);
  const startedAt = new Date().toISOString();
  const stdoutChunks = [];
  const stderrChunks = [];
  const requiredCheckpoints = readinessCheckpointsForOptions({
    ...options,
    requireVoiceCapsule: true,
  });
  const child = spawn(options.exe, [], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: startupProcessEnv(),
  });

  child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  let timedOut = false;
  let exitedDuringSoak = false;
  const exitPromise = childExitPromise(child);
  let exitResult;
  let startupDetection = {
    detected: false,
    source: null,
  };

  try {
    const startupResult = await Promise.race([
      exitPromise.then((value) => ({ kind: "exit", value })),
      waitForStartupDetection(
        () =>
          iterationEvidence({
            stdoutChunks,
            stderrChunks,
            stdoutFile: `iteration-${String(iteration).padStart(3, "0")}-stdout.txt`,
            stderrFile: `iteration-${String(iteration).padStart(3, "0")}-stderr.txt`,
            logDir: options.logDir,
            includeAppLogs: false,
          }),
        options.timeoutMs,
        250,
        requiredCheckpoints,
        { requireProcessRunId: true },
      ).then((value) => ({ kind: "startup", value })),
      sleep(options.timeoutMs).then(() => ({ kind: "timeout" })),
    ]);

    if (startupResult.kind === "startup" && startupResult.value.detected) {
      startupDetection = startupResult.value;
      const soakResult = await Promise.race([
        exitPromise.then((value) => ({ kind: "exit", value })),
        sleep(options.soakMs).then(() => ({ kind: "soak-complete" })),
      ]);
      if (soakResult.kind === "exit") {
        exitedDuringSoak = true;
        exitResult = soakResult.value;
      } else {
        child.kill();
        exitResult = await exitPromise;
      }
    } else if (startupResult.kind === "exit") {
      exitResult = startupResult.value;
    } else {
      timedOut = true;
      child.kill();
      exitResult = await exitPromise;
    }
  } finally {
    if (!child.killed) {
      child.kill();
    }
  }

  const suffix = String(iteration).padStart(3, "0");
  const stdoutFile = `iteration-${suffix}-stdout.txt`;
  const stderrFile = `iteration-${suffix}-stderr.txt`;
  const stdoutBuffer = Buffer.concat(stdoutChunks);
  const stderrBuffer = Buffer.concat(stderrChunks);
  await writeFile(path.join(runDir, stdoutFile), stdoutBuffer);
  await writeFile(path.join(runDir, stderrFile), stderrBuffer);
  const appLogEvidence = await appLogEvidenceItems(options.logDir);
  const appLogEvidenceFiles = await writeAppLogEvidenceFiles(
    runDir,
    suffix,
    appLogEvidence,
  );
  const finalEvidence = [
    { source: stdoutFile, text: stdoutBuffer.toString("utf8") },
    { source: stderrFile, text: stderrBuffer.toString("utf8") },
    ...appLogEvidence,
  ];
  if (!startupDetection.detected) {
    startupDetection = startupDetectedFromEvidence(
      finalEvidence,
      requiredCheckpoints,
      { requireProcessRunId: true },
    );
  }
  const soakEvidence = capsuleSoakEvidenceSummary(finalEvidence, {
    minHeartbeatCount: Math.max(1, Math.floor(options.soakMs / 5000) - 12),
    requireProcessRunId: true,
  });
  const soakPassed =
    startupDetection.detected && !exitedDuringSoak && soakEvidence.passed;
  const processCleanup = await waitForProcessCleanup(
    options.exe,
    processSnapshotBefore,
    [child.pid ?? null],
  );

  const summary = summarizeIteration({
    iteration,
    exe: options.exe,
    pid: child.pid ?? null,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: exitResult?.exitCode ?? null,
    signal: exitResult?.signal ?? null,
    timedOut,
    stdoutFile,
    stderrFile,
    appLogFiles: appLogEvidence.map((item) => item.source),
    appLogEvidenceFiles,
    runManifest: buildRunManifest({
      exe: options.exe,
      pid: child.pid ?? null,
      handoffPid: null,
      startupRunId: startupRunIdFromProcessEvidence(finalEvidence),
      processCleanup,
    }),
    startupDetected: soakPassed && processCleanup.passed,
    startupDetectionSource: startupDetection.source,
    soakMs: options.soakMs,
    exitedDuringSoak,
    voiceCapsuleReadyAckDetected: soakEvidence.voiceCapsuleReadyAckDetected,
    voiceCapsuleHeartbeatCount: soakEvidence.voiceCapsuleHeartbeatCount,
    staleVoiceCapsuleRecoveryDetected:
      soakEvidence.staleVoiceCapsuleRecoveryDetected,
    rendererErrorDetected: soakEvidence.rendererErrorDetected,
  });
  await writeJson(path.join(runDir, `iteration-${suffix}.json`), summary);
  return summary;
}

async function runSingleInstanceIteration(options, runDir, iteration) {
  const processSnapshotBefore = await processSnapshotForExe(options.exe);
  const startedAt = new Date().toISOString();
  const stdoutChunks = [];
  const stderrChunks = [];
  const handoffStdoutChunks = [];
  const handoffStderrChunks = [];
  const initialCheckpoints = readinessCheckpointsForOptions({
    ...options,
    scenario: "cold-start",
  });
  const shouldCloseToTray = options.scenario === "tray-reopen";
  const handoffCheckpoints = [
    singleInstanceReadyCheckpoints,
    rendererReopenAckCheckpoints,
  ];
  const trayCheckpoints = [trayHiddenCheckpoints];
  const child = spawn(options.exe, [], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: startupProcessEnv(),
  });

  child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

  let timedOut = false;
  const exitPromise = childExitPromise(child);
  let exitResult;
  let handoffExitResult = {
    pid: null,
    exitCode: null,
    signal: null,
    timedOut: false,
  };
  let startupDetection = {
    detected: false,
    source: null,
  };
  let initialStartupDetection = {
    detected: false,
    source: null,
  };
  let handoffDetection = {
    detected: false,
    source: null,
  };

  try {
    const initialStartup = await Promise.race([
      exitPromise.then((value) => ({ kind: "exit", value })),
      waitForStartupDetection(
        () =>
          iterationEvidence({
            stdoutChunks,
            stderrChunks,
            stdoutFile: `iteration-${String(iteration).padStart(3, "0")}-stdout.txt`,
            stderrFile: `iteration-${String(iteration).padStart(3, "0")}-stderr.txt`,
            logDir: options.logDir,
            includeAppLogs: false,
          }),
        options.timeoutMs,
        250,
        initialCheckpoints,
        { requireProcessRunId: true },
      ).then((value) => ({ kind: "startup", value })),
      sleep(options.timeoutMs).then(() => ({ kind: "timeout" })),
    ]);

    if (initialStartup.kind === "exit") {
      exitResult = initialStartup.value;
    } else if (
      initialStartup.kind === "startup" &&
      initialStartup.value.detected
    ) {
      initialStartupDetection = initialStartup.value;
      let trayDetection = {
        detected: true,
        source: initialStartup.value.source,
      };
      if (shouldCloseToTray) {
        await closeWindowsForPid(child.pid);
        trayDetection = await waitForStartupDetection(
          () =>
            iterationEvidence({
              stdoutChunks,
              stderrChunks,
              stdoutFile: `iteration-${String(iteration).padStart(3, "0")}-stdout.txt`,
              stderrFile: `iteration-${String(iteration).padStart(3, "0")}-stderr.txt`,
              logDir: options.logDir,
              includeAppLogs: false,
            }),
          options.timeoutMs,
          250,
          trayCheckpoints,
          { requireProcessRunId: true },
        );
      }
      const handoff = spawn(options.exe, [], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: startupProcessEnv(),
      });
      handoff.stdout?.on("data", (chunk) =>
        handoffStdoutChunks.push(Buffer.from(chunk)),
      );
      handoff.stderr?.on("data", (chunk) =>
        handoffStderrChunks.push(Buffer.from(chunk)),
      );
      handoffExitResult = await waitForHandoffExit(handoff, 5_000);
      handoffDetection = await waitForStartupDetection(
        () =>
          iterationEvidence({
            stdoutChunks,
            stderrChunks,
            stdoutFile: `iteration-${String(iteration).padStart(3, "0")}-stdout.txt`,
            stderrFile: `iteration-${String(iteration).padStart(3, "0")}-stderr.txt`,
            logDir: options.logDir,
            includeAppLogs: false,
          }),
        options.timeoutMs,
        250,
        handoffCheckpoints,
        { requireProcessRunId: true },
      );
      startupDetection = combineDetections(
        initialStartupDetection,
        trayDetection,
        handoffDetection,
      );
      child.kill();
      exitResult = await exitPromise;
    } else {
      timedOut = true;
      child.kill();
      exitResult = await exitPromise;
    }
  } finally {
    if (!child.killed) {
      child.kill();
    }
  }

  const suffix = String(iteration).padStart(3, "0");
  const stdoutFile = `iteration-${suffix}-stdout.txt`;
  const stderrFile = `iteration-${suffix}-stderr.txt`;
  const handoffStdoutFile = `iteration-${suffix}-handoff-stdout.txt`;
  const handoffStderrFile = `iteration-${suffix}-handoff-stderr.txt`;
  const stdoutBuffer = Buffer.concat(stdoutChunks);
  const stderrBuffer = Buffer.concat(stderrChunks);
  const handoffStdoutBuffer = Buffer.concat(handoffStdoutChunks);
  const handoffStderrBuffer = Buffer.concat(handoffStderrChunks);
  await writeFile(path.join(runDir, stdoutFile), stdoutBuffer);
  await writeFile(path.join(runDir, stderrFile), stderrBuffer);
  await writeFile(path.join(runDir, handoffStdoutFile), handoffStdoutBuffer);
  await writeFile(path.join(runDir, handoffStderrFile), handoffStderrBuffer);
  const appLogEvidence = await appLogEvidenceItems(options.logDir);
  const appLogEvidenceFiles = await writeAppLogEvidenceFiles(
    runDir,
    suffix,
    appLogEvidence,
  );
  if (!startupDetection.detected) {
    const finalEvidence = [
      { source: stdoutFile, text: stdoutBuffer.toString("utf8") },
      { source: stderrFile, text: stderrBuffer.toString("utf8") },
      {
        source: handoffStdoutFile,
        text: handoffStdoutBuffer.toString("utf8"),
      },
      {
        source: handoffStderrFile,
        text: handoffStderrBuffer.toString("utf8"),
      },
      ...appLogEvidence,
    ];
    if (!initialStartupDetection.detected) {
      initialStartupDetection = startupDetectedFromEvidence(
        finalEvidence,
        initialCheckpoints,
        { requireProcessRunId: true },
      );
    }
    if (!handoffDetection.detected) {
      handoffDetection = startupDetectedFromEvidence(
        finalEvidence,
        handoffCheckpoints,
        { requireProcessRunId: true },
      );
    }
    let trayDetection = {
      detected: true,
      source: initialStartupDetection.source,
    };
    if (shouldCloseToTray) {
      trayDetection = startupDetectedFromEvidence(
        finalEvidence,
        trayCheckpoints,
        { requireProcessRunId: true },
      );
    }
    startupDetection = combineDetections(
      initialStartupDetection,
      trayDetection,
      handoffDetection,
    );
  }
  const finalEvidence = [
    { source: stdoutFile, text: stdoutBuffer.toString("utf8") },
    { source: stderrFile, text: stderrBuffer.toString("utf8") },
    {
      source: handoffStdoutFile,
      text: handoffStdoutBuffer.toString("utf8"),
    },
    {
      source: handoffStderrFile,
      text: handoffStderrBuffer.toString("utf8"),
    },
    ...appLogEvidence,
  ];
  const processCleanup = await waitForProcessCleanup(
    options.exe,
    processSnapshotBefore,
    [child.pid ?? null, handoffExitResult.pid],
  );

  const summary = summarizeIteration({
    iteration,
    exe: options.exe,
    pid: child.pid ?? null,
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: exitResult?.exitCode ?? null,
    signal: exitResult?.signal ?? null,
    timedOut,
    stdoutFile,
    stderrFile,
    appLogFiles: appLogEvidence.map((item) => item.source),
    appLogEvidenceFiles,
    handoffPid: handoffExitResult.pid,
    handoffExitCode: handoffExitResult.exitCode,
    handoffSignal: handoffExitResult.signal,
    handoffTimedOut: handoffExitResult.timedOut,
    handoffStdoutFile,
    handoffStderrFile,
    runManifest: buildRunManifest({
      exe: options.exe,
      pid: child.pid ?? null,
      handoffPid: handoffExitResult.pid,
      startupRunId: startupRunIdFromProcessEvidence(finalEvidence),
      processCleanup,
    }),
    startupDetected: startupDetection.detected && processCleanup.passed,
    startupDetectionSource: startupDetection.source,
  });
  await writeJson(path.join(runDir, `iteration-${suffix}.json`), summary);
  return summary;
}

function combineDetections(first, second) {
  if (!first.detected || !second.detected) {
    return {
      detected: false,
      source: null,
    };
  }

  return {
    detected: true,
    source: second.source ?? first.source,
  };
}

function startupProcessEnv() {
  return {
    ...process.env,
    VAAK_STARTUP_DIAGNOSTICS_STDERR: "1",
  };
}

async function processSnapshotForExe(exe) {
  const processName = processNameForExecutable(exe);

  if (process.platform !== "win32") {
    return {
      available: false,
      processName,
      processCount: null,
      windowCount: "unavailable",
      visibleWindowCount: "unavailable",
      processes: [],
      reason: "unsupported_platform",
    };
  }

  const script = `
$targetName = $env:VAAK_PREFLIGHT_PROCESS_NAME
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class VaakPreflightWindows {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@
$windowCounts = @{}
$visibleWindowCounts = @{}
[VaakPreflightWindows]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  [uint32]$windowPid = 0
  [void][VaakPreflightWindows]::GetWindowThreadProcessId($hWnd, [ref]$windowPid)
  if ($windowPid -gt 0) {
    if (-not $script:windowCounts.ContainsKey($windowPid)) {
      $script:windowCounts[$windowPid] = 0
      $script:visibleWindowCounts[$windowPid] = 0
    }
    $script:windowCounts[$windowPid] = [int]$script:windowCounts[$windowPid] + 1
    if ([VaakPreflightWindows]::IsWindowVisible($hWnd)) {
      $script:visibleWindowCounts[$windowPid] = [int]$script:visibleWindowCounts[$windowPid] + 1
    }
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
$processes = @(Get-CimInstance Win32_Process -Filter "Name = '$targetName'" -ErrorAction Stop | ForEach-Object {
  $processId = [int]$_.ProcessId
  [pscustomobject]@{
    pid = $processId
    name = $_.Name
    windowCount = if ($windowCounts.ContainsKey($processId)) { [int]$windowCounts[$processId] } else { 0 }
    visibleWindowCount = if ($visibleWindowCounts.ContainsKey($processId)) { [int]$visibleWindowCounts[$processId] } else { 0 }
  }
})
$processes | ConvertTo-Json -Compress
`;

  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      VAAK_PREFLIGHT_PROCESS_NAME: processName,
    },
    windowsHide: true,
  });
  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout?.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
  child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
  const result = await childExitPromise(child);

  if (result.exitCode !== 0) {
    return {
      available: false,
      processName,
      processCount: null,
      windowCount: "unavailable",
      visibleWindowCount: "unavailable",
      processes: [],
      reason: Buffer.concat(stderrChunks).toString("utf8").trim() || "snapshot_failed",
    };
  }

  const text = Buffer.concat(stdoutChunks).toString("utf8").trim();
  const parsed = text.length > 0 ? JSON.parse(text) : [];
  const processes = (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
    pid: Number(item.pid),
    name: String(item.name ?? processName),
    windowCount: Number(item.windowCount ?? 0),
    visibleWindowCount: Number(item.visibleWindowCount ?? 0),
  }));

  return {
    available: true,
    processName,
    processCount: processes.length,
    windowCount: processes.reduce((sum, item) => sum + item.windowCount, 0),
    visibleWindowCount: processes.reduce(
      (sum, item) => sum + item.visibleWindowCount,
      0,
    ),
    processes,
  };
}

async function waitForProcessCleanup(exe, beforeSnapshot, launchedPids) {
  const startedAt = Date.now();
  let latestSnapshot = await processSnapshotForExe(exe);
  let proof = processCleanupProof(beforeSnapshot, latestSnapshot, launchedPids);

  while (!proof.passed && Date.now() - startedAt <= processCleanupTimeoutMs) {
    await sleep(250);
    latestSnapshot = await processSnapshotForExe(exe);
    proof = processCleanupProof(beforeSnapshot, latestSnapshot, launchedPids);
  }

  return proof;
}

async function closeWindowsForPid(pid) {
  if (process.platform !== "win32") {
    throw new Error("--scenario tray-reopen is currently implemented for Windows only.");
  }

  const script = `
$targetPid = [uint32]${pid}
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class VaakWindowCloser {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@
$targetWindow = [IntPtr]::Zero
$targetArea = 0
[VaakWindowCloser]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  [uint32]$windowPid = 0
  [void][VaakWindowCloser]::GetWindowThreadProcessId($hWnd, [ref]$windowPid)
  if ($windowPid -eq $targetPid -and [VaakWindowCloser]::IsWindowVisible($hWnd)) {
    $rect = New-Object VaakWindowCloser+RECT
    if ([VaakWindowCloser]::GetWindowRect($hWnd, [ref]$rect)) {
      $area = [Math]::Max(0, $rect.Right - $rect.Left) * [Math]::Max(0, $rect.Bottom - $rect.Top)
      if ($area -gt $script:targetArea) {
        $script:targetArea = $area
        $script:targetWindow = $hWnd
      }
    }
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
if ($targetWindow -eq [IntPtr]::Zero) {
  Write-Error "No visible windows found for process $targetPid."
  exit 1
}
[void][VaakWindowCloser]::PostMessage($targetWindow, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
`;
  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  const stderrChunks = [];
  child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
  const result = await childExitPromise(child);
  if (result.exitCode !== 0) {
    throw new Error(
      `failed to close main window for tray scenario: ${Buffer.concat(stderrChunks).toString("utf8")}`,
    );
  }
}

function childExitPromise(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => resolve({ exitCode, signal }));
  });
}

async function waitForHandoffExit(child, timeoutMs) {
  const exitPromise = childExitPromise(child);
  const result = await Promise.race([
    exitPromise.then((value) => ({ kind: "exit", value })),
    sleep(timeoutMs).then(() => ({ kind: "timeout" })),
  ]);

  if (result.kind === "exit") {
    return {
      pid: child.pid ?? null,
      exitCode: result.value.exitCode,
      signal: result.value.signal,
      timedOut: false,
    };
  }

  child.kill();
  const exitResult = await exitPromise;
  return {
    pid: child.pid ?? null,
    exitCode: exitResult.exitCode,
    signal: exitResult.signal,
    timedOut: true,
  };
}

async function iterationEvidence({
  stdoutChunks,
  stderrChunks,
  stdoutFile,
  stderrFile,
  logDir,
  includeAppLogs = true,
}) {
  const evidence = processEvidenceItems({
    stdoutChunks,
    stderrChunks,
    stdoutFile,
    stderrFile,
  });

  if (!includeAppLogs) {
    return evidence;
  }

  return [...evidence, ...(await appLogEvidenceItems(logDir))];
}

async function appLogEvidenceItems(logDir) {
  const appLogFiles = await listAppLogFiles(logDir);
  if (!logDir) {
    return [];
  }

  const items = await Promise.all(
    appLogFiles.map(async (file) => {
      try {
        const buffer = await readFile(path.join(logDir, file));
        return {
          source: file,
          text: buffer.toString("utf8"),
        };
      } catch {
        return {
          source: file,
          text: "",
        };
      }
    }),
  );

  return items;
}

async function writeAppLogEvidenceFiles(runDir, suffix, appLogEvidence) {
  const files = [];

  for (const item of appLogEvidence) {
    const safeSource = item.source.replace(/[^a-zA-Z0-9_.-]/g, "_");
    const file = `iteration-${suffix}-app-${safeSource}.txt`;
    await writeFile(path.join(runDir, file), item.text, "utf8");
    files.push(file);
  }

  return files;
}

async function listAppLogFiles(logDir) {
  if (!logDir) {
    return [];
  }

  try {
    const entries = await readdir(logDir);
    const files = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(logDir, entry);
        const fileStat = await stat(fullPath);
        return fileStat.isFile()
          ? { name: entry, modifiedAt: fileStat.mtimeMs }
          : null;
      }),
    );

    return files
      .filter(Boolean)
      .sort((left, right) => right.modifiedAt - left.modifiedAt)
      .slice(0, 10)
      .map((file) => file.name);
  } catch {
    return [];
  }
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parsePositiveInt(value, flag) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function parseScenario(value) {
  if (!scenarioNames.has(value)) {
    throw new Error(
      "--scenario must be one of cold-start, single-instance, tray-reopen, capsule-soak.",
    );
  }

  return value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`Run a production startup preflight and save process evidence.

Usage:
  node apps/desktop/scripts/startup-production-preflight.mjs --exe "C:\\Path\\To\\Vaak.exe"

Options:
  --exe <path>          Required production Vaak executable path
  --iterations <n>      Number of launches. Default: 1
  --timeout-ms <n>      Time before the launched process is killed. Default: 20000
  --soak-ms <n>         Capsule soak duration for --scenario capsule-soak. Default: 14400000
  --out <dir>           Evidence output directory. Default: output/startup-loops
  --log-dir <dir>       App log directory. Required to prove release renderer heartbeat readiness
  --scenario <name>     One of cold-start, single-instance, tray-reopen, capsule-soak. Default: cold-start
  --require-voice-capsule
                        Require voice capsule visibility, bounds, heartbeat, and ready ACK
  --suite               Run cold-start, single-instance, and tray-reopen as one suite
  --allow-existing-process
                        Allow a pre-existing ${processNameForExecutable("Vaak.exe")} process before the loop
  --help, -h            Show this help
`);
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    const summary = options.suite
      ? await runPreflightSuite(options)
      : await runPreflight(options);
    console.log(`Saved startup preflight evidence to ${summary.outDir}`);
    if (options.suite) {
      const failedScenarios = failedSuiteScenarios(summary);
      if (failedScenarios.length > 0) {
        console.error(
          `Startup preflight suite failed for scenario(s): ${failedScenarios.join(", ")}`,
        );
        process.exitCode = 1;
      }
      return;
    }

    const failedIterations = failedStartupIterations(summary);
    if (failedIterations.length > 0) {
      console.error(
        `Startup preflight failed for iteration(s): ${failedIterations.join(", ")}`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (import.meta.url === invokedPath) {
  await main();
}
