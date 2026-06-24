# Streaming Transcription Accuracy

Vaak treats streaming transcription as the default low-latency path when the selected provider supports it. The streaming path must preserve the same spoken content as the recorded-file path; latency optimizations must not clip words, remove useful silence, or replace earlier finalized text.

This document starts with AssemblyAI because that is the first production streaming provider. The same constraints should be reused for Deepgram, OpenAI Realtime, or any future websocket provider through provider-specific adapters behind one internal streaming contract.

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
- `auto` and `streaming` attempt streaming for AssemblyAI.
- `auto` and `streaming` fall back to async AssemblyAI when streaming fails before a final transcript or the selected model is not streaming-capable.

## Replicating To Other Providers

Before adding another streaming provider, add a provider audio profile and adapter that maps to the same internal behavior:

- declared input sample rate and PCM format;
- frame duration and max queue/backpressure behavior;
- start, audio, force-final, terminate, and error message mapping;
- ordered final transcript accumulation;
- fallback policy for `auto` mode.

Provider-specific tuning belongs in the adapter or model registry. The dictation UI and loop should only depend on normalized streaming events and the final accumulated transcript.
