import providerTestAudioUrl from "@/assets/provider-test/librispeech-61-70968-0000.flac?url";
import {
  transcribeRecording,
  type SpeechProviderId,
  type TranscriptResult,
} from "@/lib/tauri";

const EXPECTED_TRANSCRIPT =
  "he began a confused complaint against the wizard who had vanished behind the curtain on the left";

const REQUIRED_TRANSCRIPT_WORDS = [
  "confused",
  "complaint",
  "wizard",
  "vanished",
  "curtain",
  "left",
] as const;

export async function verifyOnboardingProviderTranscription(
  providerId: SpeechProviderId,
): Promise<TranscriptResult> {
  const audioBlob = await loadOnboardingProviderTestAudio();
  const transcript = await transcribeRecording({
    providerId,
    audioBlob,
    language: "en",
  });

  if (!matchesExpectedTranscript(transcript.text)) {
    throw new Error(
      "Provider test did not return the expected transcript. Check the saved settings and try again.",
    );
  }

  return transcript;
}

async function loadOnboardingProviderTestAudio(): Promise<Blob> {
  const response = await fetch(providerTestAudioUrl);

  if (!response.ok) {
    throw new Error("Unable to load the provider test audio.");
  }

  const audioBytes = await response.arrayBuffer();
  return new Blob([audioBytes], { type: "audio/flac" });
}

function matchesExpectedTranscript(text: string): boolean {
  const normalizedText = normalizeTranscript(text);

  return (
    normalizedText === EXPECTED_TRANSCRIPT ||
    REQUIRED_TRANSCRIPT_WORDS.every((word) => normalizedText.includes(word))
  );
}

function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
