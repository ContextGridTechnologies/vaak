# Streaming Transcription Accuracy

Vaak treats streaming transcription as the default low-latency path when the selected provider supports it. The streaming path must preserve the same spoken content as the recorded-file path; latency optimizations must not clip words, remove useful silence, or replace earlier finalized text.

This document starts with AssemblyAI and Smallest AI because they are the first production streaming providers. The same constraints should be reused for ElevenLabs, Deepgram, OpenAI Realtime, or any future websocket provider through provider-specific adapters behind one internal streaming contract.

## AssemblyAI Requirements

AssemblyAI's streaming websocket expects raw binary audio frames, not JSON or base64. The documented browser-agnostic websocket shape is:

- endpoint: `wss://streaming.assemblyai.com/v3/ws`
- auth: `Authorization` header with the API key and no `Bearer` prefix
- audio: mono 16-bit PCM
- sample rate: set `sample_rate` to match the PCM source
- chunk cadence: roughly 50 ms, or 800 samples / 1600 bytes at 16 kHz
- termination: send `{"type":"Terminate"}` and keep reading until the `Termination` event arrives

Sources:

- AssemblyAI quickstart: https://www.assemblyai.com/docs/streaming/getting-started/transcribe-streaming-audio
- AssemblyAI message sequence: https://www.assemblyai.com/docs/streaming/message-sequence
- AssemblyAI accuracy/latency tuning: https://www.assemblyai.com/docs/streaming/getting-started/optimizing-accuracy-and-latency
- AssemblyAI model selection: https://www.assemblyai.com/docs/streaming/select-the-speech-model

For desktop dictation, Vaak should prefer accuracy over earliest possible partials. AssemblyAI documents `mode=max_accuracy` for note-taking and scribe-style workloads where added delay is acceptable. Vaak also passes `language_code=en` for the current English dictation path, matching the existing async transcription call.

## Regression Cause

The first streaming implementation was not audio-equivalent to the async path:

- It started the websocket only after a local amplitude threshold was crossed.
- It skipped low-amplitude chunks and silence before sending audio.
- It therefore clipped quiet leading speech and removed pauses that the provider uses for turn detection.
- It stored only the latest finalized turn, so multi-sentence dictation could lose earlier finalized text.
- Provider websocket `Error` messages were parsed as unknown events, delaying or hiding the fallback path.

These are application-level accuracy failures. They can produce a large quality drop even if the provider model is working correctly.

## Production Contract

Streaming adapters should consume a normalized live audio stream:

```text
sampleRateHz: provider profile sample rate
encoding: pcm_s16le
channels: 1
frameMs: provider profile frame size, 50 ms for AssemblyAI
```

The frontend recorder should:

- resample live microphone samples to the provider audio profile;
- send every PCM chunk while recording, including low-volume chunks and silence;
- avoid local VAD as a transport gate unless it is provider-approved and preserves timing;
- aggregate finalized turns by provider turn order;
- keep partial text visible only as draft UI state, not committed transcript state.

The backend provider adapter should:

- frame PCM according to the provider profile;
- keep provider-specific websocket URLs, auth, query parameters, and message names inside the adapter;
- normalize final, partial, terminal, and error events before returning them to the dictation pipeline;
- expose provider timeline events without transcript text or API keys;
- terminate explicitly and keep reading until the provider terminal event.

## AssemblyAI Implementation

Current AssemblyAI streaming defaults:

```text
speech_model=u3-rt-pro
sample_rate=16000
mode=max_accuracy
language_code=en
frame_ms=50
```

Vaak's AssemblyAI model list follows the current public docs:

- Pre-recorded: `universal-3-5-pro`, `universal-3-pro`, `universal-2`
- Streaming: `universal-3-5-pro`, `u3-rt-pro`, `universal-streaming-english`, `universal-streaming-multilingual`

The streaming adapter uses the saved selected model exactly when that model supports streaming. It does not translate a pre-recorded model into a different streaming model. For example, a saved `universal-3-pro` selection is normal-only; Fast mode can attempt streaming, but the backend rejects that streaming start and the dictation loop falls back to the normal async path with the saved model.

The dictation pipeline remains resilient:

- `standard` mode uses the async provider path.
- `auto` and `streaming` attempt streaming for providers with an implemented streaming route.
- `auto` and `streaming` fall back to async transcription when streaming fails before a final transcript or the selected model is not streaming-capable.

## Smallest AI Implementation

Current Smallest AI streaming defaults:

```text
model=pulse
sample_rate=16000
encoding=linear16
language=en
frame_bytes=4096
```

Smallest AI's live endpoint uses a provider-specific websocket shape:

- endpoint: `wss://api.smallest.ai/waves/v1/stt/live?model=pulse`
- auth: `Authorization: Bearer {api_key}`
- audio: mono 16-bit PCM binary frames
- sample rate: 16 kHz
- chunk size: 4096 bytes
- termination: send `{"type":"close_stream"}` and keep reading until an event with `is_last=true`

Vaak treats `pulse` as the only Smallest streaming model. `pulse-pro` remains batch-only and must never silently remap to `pulse` for streaming. If the saved Smallest model is `pulse-pro`, streaming startup returns an unsupported-route error and the dictation loop can fall back to the batch path.

## ElevenLabs Implementation

ElevenLabs realtime speech-to-text uses the shared streaming contract with a provider-specific websocket codec:

```text
model=scribe_v2_realtime
sample_rate=16000
audio_format=pcm_16000
commit_strategy=manual
frame_bytes=3200
transport=json_base64
```

ElevenLabs differs from AssemblyAI and Smallest AI because its realtime API sends audio through JSON `input_audio_chunk` messages with base64 audio, not raw binary websocket frames. The adapter keeps that detail inside `elevenlabs_streaming.rs`; the frontend still sends normalized 16 kHz mono PCM and aggregates normalized partial/final events.

Vaak keeps `scribe_v2` and `scribe_v1` as batch routes. `scribe_v2_realtime` is a streaming-only route. Do not silently remap a saved `scribe_v2` or `scribe_v1` batch model to `scribe_v2_realtime`.

See [ELEVENLABS_STREAMING_PLAN.md](ELEVENLABS_STREAMING_PLAN.md) for the provider-specific implementation plan.

## Deepgram Plan

Deepgram streaming should use Nova-3 on `wss://api.deepgram.com/v1/listen` with raw 16 kHz mono `linear16` PCM binary frames, `interim_results=true`, `smart_format=true`, and explicit JSON text control messages for `Finalize` and `CloseStream`.

Unlike ElevenLabs, Deepgram does not require base64 JSON audio. Unlike AssemblyAI, Deepgram's finalization is controlled by `Finalize` and `CloseStream` messages. The adapter should keep those details behind the shared streaming event contract.

Deepgram final results should be accumulated by final result segment, not by partial text. The adapter should ignore empty interim results and de-duplicate any repeated final segment that arrives during finalization or close.

See [DEEPGRAM_STREAMING_PLAN.md](DEEPGRAM_STREAMING_PLAN.md) for the provider-specific implementation plan.

## Replicating To Other Providers

Before adding another streaming provider, add a provider audio profile and adapter that maps to the same internal behavior:

- declared input sample rate and PCM format;
- frame duration and max queue/backpressure behavior;
- start, audio, force-final, terminate, and error message mapping;
- ordered final transcript accumulation;
- fallback policy for `auto` mode.

Provider-specific tuning belongs in the adapter or model registry. The dictation UI and loop should only depend on normalized streaming events and the final accumulated transcript.
