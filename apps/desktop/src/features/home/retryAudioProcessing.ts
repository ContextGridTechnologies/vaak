import { analyzeAudioCapture, type CaptureAnalysis } from "@/hooks/audioProcessing";

export type RetryAudioAnalysis = Pick<
  CaptureAnalysis,
  "processedAudio" | "transcriptionSegments"
>;

export async function analyzeAudioForRetry(
  audioBlob: Blob,
): Promise<RetryAudioAnalysis> {
  const audioBuffer = await decodeAudioBlob(audioBlob);
  const samples = downmixAudioBuffer(audioBuffer);

  const analysis = analyzeAudioCapture(samples, audioBuffer.sampleRate);
  return {
    processedAudio: analysis.processedAudio,
    transcriptionSegments: analysis.transcriptionSegments,
  };
}

async function decodeAudioBlob(audioBlob: Blob): Promise<AudioBuffer> {
  const AudioContextConstructor =
    window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("Audio decoding is unavailable in this environment.");
  }

  const context = new AudioContextConstructor();
  try {
    const buffer = await audioBlob.arrayBuffer();
    return await context.decodeAudioData(buffer.slice(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}

function downmixAudioBuffer(audioBuffer: AudioBuffer) {
  if (audioBuffer.numberOfChannels === 0) {
    return new Float32Array();
  }

  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0).slice();
  }

  const sampleCount = audioBuffer.length;
  const samples = new Float32Array(sampleCount);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let index = 0; index < sampleCount; index += 1) {
      samples[index] += channelData[index] / audioBuffer.numberOfChannels;
    }
  }

  return samples;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
