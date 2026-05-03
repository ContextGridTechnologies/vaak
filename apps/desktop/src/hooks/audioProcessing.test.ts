import { describe, expect, it } from "vitest";

import {
  analyzeAudioCapture,
  createWavBlob,
  defaultCaptureThresholds,
} from "./audioProcessing";

const sampleRate = 16000;

describe("analyzeAudioCapture", () => {
  it("trims leading and trailing silence around a valid speech segment", () => {
    const samples = createSamples([
      silenceMs(300),
      toneMs(900, 0.28),
      silenceMs(400),
    ]);

    const analysis = analyzeAudioCapture(samples, sampleRate);

    expect(analysis.disposition).toBe("ready");
    expect(analysis.reason).toBeNull();
    expect(analysis.metrics.leadingTrimMs).toBeGreaterThanOrEqual(150);
    expect(analysis.metrics.trailingTrimMs).toBeGreaterThanOrEqual(200);
    expect(analysis.transcriptionSegments).toHaveLength(1);
  });

  it("marks silence-only capture as unclear with no speech", () => {
    const samples = createSamples([silenceMs(1200)]);

    const analysis = analyzeAudioCapture(samples, sampleRate);

    expect(analysis.disposition).toBe("unclear");
    expect(analysis.reason).toBe("no_speech");
    expect(analysis.transcriptionSegments).toHaveLength(0);
  });

  it("splits valid speech into multiple segments when there is a long pause", () => {
    const samples = createSamples([
      silenceMs(100),
      toneMs(700, 0.3),
      silenceMs(1000),
      toneMs(650, 0.26),
      silenceMs(150),
    ]);

    const analysis = analyzeAudioCapture(samples, sampleRate);

    expect(analysis.disposition).toBe("ready");
    expect(analysis.metrics.longestPauseMs).toBeGreaterThanOrEqual(800);
    expect(analysis.transcriptionSegments).toHaveLength(2);
  });

  it("keeps pauses shorter than the segmentation threshold in a single segment", () => {
    const samples = createSamples([
      silenceMs(100),
      toneMs(700, 0.3),
      silenceMs(600),
      toneMs(650, 0.26),
      silenceMs(150),
    ]);

    const analysis = analyzeAudioCapture(samples, sampleRate);

    expect(analysis.disposition).toBe("ready");
    expect(analysis.transcriptionSegments).toHaveLength(1);
    expect(analysis.processedAudio).toBeInstanceOf(Blob);
  });

  it("rejects low-volume speech as unclear", () => {
    const samples = createSamples([
      silenceMs(250),
      toneMs(800, 0.012),
      silenceMs(200),
    ]);

    const analysis = analyzeAudioCapture(samples, sampleRate);

    expect(analysis.disposition).toBe("unclear");
    expect(analysis.reason).toBe("low_volume");
  });

  it("pads the final transcription segment with at least one second of trailing silence", async () => {
    const samples = createSamples([
      silenceMs(120),
      toneMs(500, 0.28),
    ]);

    const analysis = analyzeAudioCapture(samples, sampleRate);
    const segment = analysis.transcriptionSegments[0];
    const durationMs = await wavDurationMs(segment);

    expect(analysis.disposition).toBe("ready");
    expect(durationMs).toBeGreaterThanOrEqual(1450);
  });
});

describe("createWavBlob", () => {
  it("encodes mono PCM as a wav blob", async () => {
    const blob = createWavBlob(new Float32Array([0, 0.5, -0.5]), sampleRate);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    expect(blob.type).toBe("audio/wav");
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
  });
});

function createSamples(segments: Float32Array[]) {
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;

  for (const segment of segments) {
    result.set(segment, offset);
    offset += segment.length;
  }

  return result;
}

function silenceMs(durationMs: number) {
  return new Float32Array(Math.round((durationMs / 1000) * sampleRate));
}

function toneMs(durationMs: number, amplitude: number) {
  const frameCount = Math.round((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(frameCount);
  for (let index = 0; index < frameCount; index += 1) {
    samples[index] = Math.sin((2 * Math.PI * 220 * index) / sampleRate) * amplitude;
  }
  return samples;
}

async function wavDurationMs(blob: Blob | undefined) {
  if (!blob) {
    throw new Error("Expected a wav blob.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sampleCount = (bytes.length - 44) / 2;
  return (sampleCount / sampleRate) * 1000;
}

describe("defaultCaptureThresholds", () => {
  it("keeps the planned long-pause threshold for segmentation", () => {
    expect(defaultCaptureThresholds.segmentationSilenceMs).toBe(800);
  });
});
