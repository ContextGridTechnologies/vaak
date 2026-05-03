export type CaptureDisposition = "ready" | "unclear";
export type CaptureReason =
  | "no_speech"
  | "too_short"
  | "low_volume"
  | "low_snr"
  | null;

export type CaptureMetrics = {
  voicedMs: number;
  leadingTrimMs: number;
  trailingTrimMs: number;
  longestPauseMs: number;
  estimatedSnrDb: number;
  averageDbfs: number;
  peakDbfs: number;
};

export type CaptureAnalysis = {
  disposition: CaptureDisposition;
  reason: CaptureReason;
  metrics: CaptureMetrics;
  processedAudio: Blob | null;
  transcriptionSegments: Blob[];
};

export type CaptureThresholds = {
  frameMs: number;
  calibrationMs: number;
  minVoicedMs: number;
  speechEndSilenceMs: number;
  prefixPaddingMs: number;
  suffixPaddingMs: number;
  segmentationSilenceMs: number;
  lowSnrDb: number;
  minimumVoiceDbfs: number;
  lowVolumeAverageDbfs: number;
  lowVolumePeakDbfs: number;
  lowLevelPeakDbfs: number;
};

export const defaultCaptureThresholds: CaptureThresholds = {
  frameMs: 20,
  calibrationMs: 200,
  minVoicedMs: 300,
  speechEndSilenceMs: 400,
  prefixPaddingMs: 120,
  suffixPaddingMs: 180,
  segmentationSilenceMs: 800,
  lowSnrDb: 8,
  minimumVoiceDbfs: -35,
  lowVolumeAverageDbfs: -35,
  lowVolumePeakDbfs: -24,
  lowLevelPeakDbfs: -45,
};

type SegmentWindow = {
  startFrame: number;
  endFrame: number;
};

export function analyzeAudioCapture(
  samples: Float32Array,
  sampleRate: number,
  thresholds: CaptureThresholds = defaultCaptureThresholds,
): CaptureAnalysis {
  if (samples.length === 0 || sampleRate <= 0) {
    return unclearAnalysis("no_speech");
  }

  const frameSize = Math.max(1, Math.round((thresholds.frameMs / 1000) * sampleRate));
  const calibrationFrames = Math.max(
    1,
    Math.round(thresholds.calibrationMs / thresholds.frameMs),
  );
  const segmentationFrames = Math.max(
    1,
    Math.round(thresholds.segmentationSilenceMs / thresholds.frameMs),
  );
  const frames = buildFrames(samples, frameSize);

  const peakDbfs = dbfsFromAmplitude(maxAbs(samples));
  const calibrationSlice = frames.slice(0, calibrationFrames);
  const noiseFloorDb = average(
    (calibrationSlice.length > 0 ? calibrationSlice : frames).map((frame) => frame.rmsDbfs),
  );
  const voiceThresholdDb = Math.max(
    noiseFloorDb + thresholds.lowSnrDb,
    thresholds.minimumVoiceDbfs,
  );

  const voicedFrames = frames.filter((frame) => frame.rmsDbfs >= voiceThresholdDb);
  if (voicedFrames.length === 0) {
    return unclearAnalysis(peakDbfs >= thresholds.lowLevelPeakDbfs ? "low_volume" : "no_speech", {
      peakDbfs,
      estimatedSnrDb: 0,
    });
  }

  const segmentWindows: SegmentWindow[] = [];
  let currentStart: number | null = null;
  let lastVoicedFrameIndex = -1;

  for (const frame of voicedFrames) {
    if (currentStart === null) {
      currentStart = frame.index;
      lastVoicedFrameIndex = frame.index;
      continue;
    }

    if (frame.index - lastVoicedFrameIndex > segmentationFrames) {
      segmentWindows.push({
        startFrame: currentStart,
        endFrame: lastVoicedFrameIndex,
      });
      currentStart = frame.index;
    }
    lastVoicedFrameIndex = frame.index;
  }

  if (currentStart !== null) {
    segmentWindows.push({
      startFrame: currentStart,
      endFrame: lastVoicedFrameIndex,
    });
  }

  const longestPauseMs = segmentWindows.reduce((longest, window, index) => {
    if (index === 0) {
      return longest;
    }
    const previousWindow = segmentWindows[index - 1];
    const gapFrames = window.startFrame - previousWindow.endFrame - 1;
    return Math.max(longest, gapFrames * thresholds.frameMs);
  }, 0);

  const voicedMs = voicedFrames.length * thresholds.frameMs;
  if (voicedMs < thresholds.minVoicedMs) {
    return unclearAnalysis("too_short", {
      voicedMs,
      peakDbfs,
      estimatedSnrDb: average(voicedFrames.map((frame) => frame.rmsDbfs)) - noiseFloorDb,
      averageDbfs: average(voicedFrames.map((frame) => frame.rmsDbfs)),
      longestPauseMs,
    });
  }

  const averageDbfs = average(voicedFrames.map((frame) => frame.rmsDbfs));
  const estimatedSnrDb = averageDbfs - noiseFloorDb;
  if (
    averageDbfs < thresholds.lowVolumeAverageDbfs ||
    peakDbfs < thresholds.lowVolumePeakDbfs
  ) {
    return unclearAnalysis("low_volume", {
      voicedMs,
      peakDbfs,
      averageDbfs,
      estimatedSnrDb,
      longestPauseMs,
    });
  }

  if (estimatedSnrDb < thresholds.lowSnrDb) {
    return unclearAnalysis("low_snr", {
      voicedMs,
      peakDbfs,
      averageDbfs,
      estimatedSnrDb,
      longestPauseMs,
    });
  }

  const prefixPaddingFrames = Math.round(thresholds.prefixPaddingMs / thresholds.frameMs);
  const suffixPaddingFrames = Math.round(thresholds.suffixPaddingMs / thresholds.frameMs);
  const segmentSamples = segmentWindows
    .map((window) => {
      const startFrame = Math.max(0, window.startFrame - prefixPaddingFrames);
      const endFrame = Math.min(frames.length - 1, window.endFrame + suffixPaddingFrames);
      const startSample = startFrame * frameSize;
      const endSample = Math.min(samples.length, (endFrame + 1) * frameSize);
      return samples.slice(startSample, endSample);
    })
    .filter((segmentSample) => segmentSample.length > 0);
  const transcriptionSegments = segmentSamples.map((segmentSample) =>
    createWavBlob(segmentSample, sampleRate),
  );
  const processedAudio =
    segmentSamples.length > 0
      ? createWavBlob(joinSegmentSamples(segmentSamples, sampleRate), sampleRate)
      : null;

  const firstVoicedSample = voicedFrames[0].index * frameSize;
  const lastVoicedFrame = voicedFrames[voicedFrames.length - 1];
  const lastVoicedSample = Math.min(
    samples.length,
    (lastVoicedFrame.index + 1) * frameSize,
  );

  return {
    disposition: "ready",
    reason: null,
    metrics: {
      voicedMs,
      leadingTrimMs: Math.round((firstVoicedSample / sampleRate) * 1000),
      trailingTrimMs: Math.round(((samples.length - lastVoicedSample) / sampleRate) * 1000),
      longestPauseMs,
      estimatedSnrDb: roundMetric(estimatedSnrDb),
      averageDbfs: roundMetric(averageDbfs),
      peakDbfs: roundMetric(peakDbfs),
    },
    processedAudio,
    transcriptionSegments,
  };
}

export function createWavBlob(
  samples: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000,
): Blob {
  const monoSamples =
    inputSampleRate === targetSampleRate
      ? samples
      : resampleLinear(samples, inputSampleRate, targetSampleRate);
  const wav = encodeWav(monoSamples, targetSampleRate);
  return new Blob([wav], { type: "audio/wav" });
}

function buildFrames(samples: Float32Array, frameSize: number) {
  const frames: Array<{ index: number; rmsDbfs: number }> = [];
  const frameCount = Math.ceil(samples.length / frameSize);

  for (let index = 0; index < frameCount; index += 1) {
    const start = index * frameSize;
    const end = Math.min(samples.length, start + frameSize);
    const frame = samples.subarray(start, end);
    frames.push({
      index,
      rmsDbfs: dbfsFromAmplitude(rms(frame)),
    });
  }

  return frames;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function resampleLinear(
  samples: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number,
) {
  if (samples.length === 0) {
    return samples;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(samples.length - 1, lowerIndex + 1);
    const weight = position - lowerIndex;
    output[index] =
      samples[lowerIndex] * (1 - weight) + samples[upperIndex] * weight;
  }

  return output;
}

function unclearAnalysis(
  reason: Exclude<CaptureReason, null>,
  metrics: Partial<CaptureMetrics> = {},
): CaptureAnalysis {
  return {
    disposition: "unclear",
    reason,
    metrics: {
      voicedMs: metrics.voicedMs ?? 0,
      leadingTrimMs: metrics.leadingTrimMs ?? 0,
      trailingTrimMs: metrics.trailingTrimMs ?? 0,
      longestPauseMs: metrics.longestPauseMs ?? 0,
      estimatedSnrDb: metrics.estimatedSnrDb ?? 0,
      averageDbfs: metrics.averageDbfs ?? -100,
      peakDbfs: metrics.peakDbfs ?? -100,
    },
    processedAudio: null,
    transcriptionSegments: [],
  };
}

function joinSegmentSamples(segments: Float32Array[], sampleRate: number) {
  if (segments.length === 1) {
    return segments[0];
  }

  const separatorSamples = Math.max(1, Math.round(sampleRate * 0.12));
  const totalLength =
    segments.reduce((sum, segment) => sum + segment.length, 0) +
    separatorSamples * (segments.length - 1);
  const combined = new Float32Array(totalLength);
  let offset = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    combined.set(segment, offset);
    offset += segment.length;

    if (index < segments.length - 1) {
      offset += separatorSamples;
    }
  }

  return combined;
}

function dbfsFromAmplitude(value: number) {
  return roundMetric(20 * Math.log10(Math.max(value, 1e-5)));
}

function rms(samples: Float32Array) {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / samples.length);
}

function maxAbs(samples: Float32Array) {
  let peak = 0;
  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
