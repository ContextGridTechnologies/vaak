# Transcription Model Catalog

Vaak stores user-selectable transcription models in a provider-agnostic catalog. A saved provider configuration keeps one model `id`, while backend routing chooses the internal batch or streaming route for the current dictation path.

## Product Flow

Vaak is a voice input layer for writing text in desktop apps. In the basic dictation flow, the user presses the configured key, speaks, Vaak transcribes the captured speech, and the resulting text is inserted where the user is typing.

This is speech-to-text transcription, not text translation. Product copy can describe it as dictation, voice input, or transcription. Backend code should use `Batch` for the request-response path and `Streaming` for live session transcription.

## Purpose

The catalog separates user selection from provider transport details:

- `TranscriptionModelDefinition` is the model users can select and save.
- `TranscriptionModelRoute` is a backend route for a mode such as batch or streaming.
- Provider adapters still own provider request field names such as `model`, `model_id`, `speech_model`, or `speech_models`.

The UI should keep showing simple model names. It should not display catalog route metadata such as endpoint profile, audio profile, retry policy, billing unit, or backend capability flags.

The visible settings model picker should be curated for Vaak's normal dictation workflow. Do not expose every provider model family, vertical model, legacy model, or specialty model just because a provider documents it. Keep compatibility routes in the backend only when they protect existing saved configurations or already-implemented behavior.

## Modes

Vaak uses `TranscriptionMode::Streaming` for the normal live dictation path when the selected provider and model support it. `TranscriptionMode::Batch` remains the prerecorded/request-response compatibility and fallback path.

Avoid using `Normal` in code. Do not expose batch vs streaming as a normal user-facing Settings choice; provider/model selection should stay simple and the dictation loop should choose the route.

## Route Resolution

When a provider configuration has a saved model:

1. Batch transcription requests that model's `Batch` route.
2. Streaming transcription requests that model's `Streaming` route.
3. If the model does not support the requested route, the resolver returns `invalid_provider_request`.

When no model is saved, the resolver uses the provider default for the internal route requested by the dictation loop.

This prevents silent remaps. For example, AssemblyAI `universal-3-pro` is batch-only and must never resolve to `u3-rt-pro` for streaming. If streaming startup fails because the selected model is batch-only, the existing dictation flow can fall back to batch transcription.

## Catalog Fields

Keep catalog fields limited to routing, testing, and provider behavior:

- `provider_id`: provider owner.
- `id`: saved app selection ID.
- `label`: simple UI name.
- `provider_model_id`: exact model ID sent to the provider for that route.
- `mode`: `Batch` or `Streaming`.
- `default_for_mode`: default route for a provider and mode.
- `endpoint_profile_id`: provider endpoint or session shape.
- `audio_profile_id`: sample rate, encoding, and frame/file contract.
- `capabilities`: language hint, prompt/keyterms, partial results, and final results.
- `retry_policy_id`: HTTP file, async job, websocket session, etc.
- `billing_unit`: audio duration, session duration, or unknown.
- `test_profile_id`: stable hook for future model tests and evals.

Do not add frontend descriptions, fallback copy, pricing copy, or capability marketing text to this catalog.

## Recommended Visible Models

The visible provider pickers should stay focused on models a dictation user can reasonably choose:

- OpenAI: `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, `whisper-1`.
- AssemblyAI: `universal-3-5-pro`, `universal-3-pro`, `u3-rt-pro`.
- ElevenLabs: `scribe_v2`, `scribe_v2_realtime`, `scribe_v1`.
- Deepgram: `nova-3` as the internal default; no visible model picker unless there is a real user-facing choice.
- Smallest AI: `pulse`, `pulse-pro`.
- Azure OpenAI: configured deployment ID, not a fixed public model picker.

## AssemblyAI Compatibility Routes

- `universal-3-5-pro`: batch and streaming.
- `universal-3-pro`: batch only.
- `universal-2`: batch only.
- `u3-rt-pro`: streaming only.
- `universal-streaming-english`: streaming only.
- `universal-streaming-multilingual`: streaming only.

## Provider Research Notes

The catalog should reflect both the provider's public model surface and Vaak's implemented backend routes. A model is not marked as `Streaming` unless Vaak has an adapter path that can actually start a streaming session with that provider.

### OpenAI

OpenAI's file-oriented Speech to Text guide lists these transcription models for `/v1/audio/transcriptions`:

- `gpt-4o-mini-transcribe`: batch.
- `gpt-4o-transcribe`: batch.
- `gpt-4o-transcribe-diarize`: batch, with diarization-specific response support.
- `whisper-1`: batch.

OpenAI's realtime transcription guide uses `gpt-realtime-whisper` for live transcription sessions, so the catalog marks it as streaming only.

The visible OpenAI picker omits `gpt-4o-transcribe-diarize` because speaker diarization is for meeting-style recordings, not the normal press-key-and-insert-text dictation workflow.

The catalog intentionally does not include `gpt-4o-transcribe-latest` because the current Speech to Text guide does not list that as a transcription model ID.

### Azure OpenAI

Azure OpenAI speech-to-text is deployment-based. The API path uses `/openai/deployments/{deployment}/audio/transcriptions`, and Microsoft's docs note that the deployment name is not necessarily the same as the underlying model name. For that reason, Azure OpenAI should continue storing `deployment_id` in provider configuration instead of pretending there is one static catalog model ID.

Azure also has GPT realtime audio models, but Vaak does not currently have an Azure realtime transcription adapter. Do not mark Azure realtime models as `Streaming` in this catalog until that route exists.

### AssemblyAI

AssemblyAI has separate prerecorded and streaming surfaces:

- `universal-3-5-pro`: available through the batch transcript route and the Universal-3.5 Pro Streaming route.
- `universal-3-pro`: batch only in Vaak.
- `universal-2`: batch only.
- `u3-rt-pro`: streaming only.
- `universal-streaming-english`: streaming only.
- `universal-streaming-multilingual`: streaming only.

`universal-3-pro` must never resolve to `u3-rt-pro`. If the user selects `universal-3-pro` and asks for a streaming session, the resolver should return an unsupported-route error and let the dictation flow decide whether to fall back to batch.

The visible AssemblyAI picker should omit `universal-2`, `universal-streaming-english`, and `universal-streaming-multilingual` unless a future advanced settings surface gives users a concrete reason to choose those legacy or specialized routes.

### Deepgram

Deepgram's docs describe `nova-3` as the recommended highest-performing general-purpose ASR model for batch or streaming, list `flux-general-en` and `flux-general-multi` for streaming voice-agent workflows, and expose model IDs through the `model` query parameter on `/v1/listen`.

Vaak implements Deepgram batch and streaming transcription through `/v1/listen`, so the catalog keeps one dictation-focused Deepgram model with separate routes:

- `nova-3`: batch and streaming.

Deepgram streaming uses `wss://api.deepgram.com/v1/listen`, `Authorization: Token {api_key}`, 16 kHz mono `linear16` PCM binary frames, `interim_results=true`, `smart_format=true`, `endpointing=300`, and text control messages for `KeepAlive`, `Finalize`, and `CloseStream`.

Do not add Deepgram vertical, legacy, or provider-internal variants such as `nova-2-finance`, `nova-2-video`, `nova-2-drivethru`, `nova-2-atc`, or Deepgram-hosted Whisper variants to the Vaak model catalog unless the product exposes an advanced model picker with a concrete user need. Do not mark `flux-general-en`, `flux-general-multi`, or other Flux variants as `Streaming` until Vaak intentionally designs a separate voice-agent route.

### ElevenLabs

ElevenLabs' speech-to-text endpoint lists `scribe_v2` and `scribe_v1` for batch transcription through `/v1/speech-to-text`, and its examples use `scribe_v2`. Their realtime speech-to-text docs use `scribe_v2_realtime`.

Visible models:

- `scribe_v2`: batch.
- `scribe_v2_realtime`: streaming.
- `scribe_v1`: batch.

ElevenLabs realtime uses `wss://api.elevenlabs.io/v1/speech-to-text/realtime`, `xi-api-key` auth, `audio_format=pcm_16000`, 16 kHz mono PCM encoded as base64 inside JSON `input_audio_chunk` messages, and committed transcript events for final text. `scribe_v2` and `scribe_v1` must never silently resolve to `scribe_v2_realtime`; unsupported streaming requests should fall back through the dictation loop.

### Smallest AI

Smallest AI's current Pulse STT overview documents a unified endpoint, `https://api.smallest.ai/waves/v1/stt/`, with a `model` query parameter:

- `pulse`: multilingual, supports pre-recorded and streaming in Smallest's API.
- `pulse-pro`: English-only, pre-recorded HTTP only.

Vaak implements both Smallest routes that fit the current product:

- `pulse`: batch and streaming.
- `pulse-pro`: batch only.

Smallest streaming uses `wss://api.smallest.ai/waves/v1/stt/live?model=pulse`, bearer auth, 16 kHz mono `linear16` PCM, 4096-byte binary frames, and a `{"type":"close_stream"}` control message before waiting for `is_last=true`.

`pulse-pro` must never resolve to `pulse` for streaming. If the user selects `pulse-pro` and asks for a streaming session, the resolver should return an unsupported-route error and let the dictation flow decide whether to fall back to batch.
