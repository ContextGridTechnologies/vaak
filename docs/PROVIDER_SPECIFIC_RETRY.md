# Provider Specific Retry Notes

This document records provider-specific model-calling behavior. It depends on the base contract in [MODEL_CALLING_RETRY_BASE.md](MODEL_CALLING_RETRY_BASE.md).

Provider notes should describe only behavior that differs from, or concretely implements, the base contract. Do not let provider-specific details leak into the dictation pipeline.

## Current Providers

### OpenAI

Provider id: `openai`

Speech endpoint:

- `POST https://api.openai.com/v1/audio/transcriptions`
- multipart upload with `file`, `model`, and `response_format=json`
- optional `language`
- optional `prompt` for supported transcription models

Defaults and limits:

- default model: `gpt-4o-mini-transcribe`
- max audio: 25 MB
- empty audio is an invalid local request
- blank response text is `invalid_provider_response`

Retry notes:

- OpenAI uses the shared transport retry helper with a fresh multipart request per attempt.
- It retries `429` and `5xx` according to the base policy.
- Do not retry `400`, `401`, `403`, empty transcript, or malformed response.

### Azure OpenAI

Provider id: `azure-openai`

Speech endpoint:

- `POST {endpoint}/openai/deployments/{deploymentId}/audio/transcriptions?api-version={apiVersion}`
- multipart upload with `file` and `response_format=json`
- optional `language`
- optional `prompt` for supported transcription deployments

Configuration:

- endpoint must be a bare origin
- deployment id is required
- API version defaults to `2025-04-01-preview`
- deployment id is treated as the model identifier returned to the app

Defaults and limits:

- max audio: 25 MB
- empty audio is an invalid local request
- blank response text is `invalid_provider_response`

Retry notes:

- Azure OpenAI uses the shared transport retry helper with a fresh multipart request per attempt.
- It retries `429` and `5xx` according to the base policy.
- Preserve Azure endpoint normalization and deployment-id validation before any request is built.

### AssemblyAI

Provider id: `assemblyai`

Speech flow:

1. `POST https://api.assemblyai.com/v2/upload`
2. `POST https://api.assemblyai.com/v2/transcript`
3. Poll `GET https://api.assemblyai.com/v2/transcript/{id}`

Async defaults and limits:

- default model: `universal-3-pro`
- supported models: `universal-3-5-pro`, `universal-3-pro`, `universal-2`
- max audio: 2.2 GB
- poll interval: 3 seconds
- max poll attempts: 40
- blank completed transcript is `invalid_provider_response`
- provider `error` status maps to `provider_request_failed`

Streaming flow:

1. Open `wss://streaming.assemblyai.com/v3/ws`
2. Send mono 16-bit PCM binary frames at the declared sample rate.
3. Receive `Turn` events for partial and final transcripts.
4. Send `{"type":"Terminate"}` and continue reading until `Termination`.

Streaming defaults and limits:

- default model: `u3-rt-pro`
- supported models: `universal-3-5-pro`, `u3-rt-pro`, `universal-streaming-english`, `universal-streaming-multilingual`
- sample rate: 16 kHz
- frame size: 50 ms / 1600 bytes
- mode: `max_accuracy`
- language code: `en`
- websocket `Error` events map to `provider_request_failed`
- the frontend must send continuous PCM, including silence, and aggregate final turns by `turn_order`
- the streaming adapter must use the saved selected streaming-capable model exactly; if the saved model is pre-recorded only, streaming start fails and the dictation loop falls back to the async path

Retry notes:

- AssemblyAI is multi-step, so transport retry must be applied per step, not around the whole flow.
- Upload, transcript creation, and each individual poll request use the shared base retry policy for transient HTTP failures.
- Upload retry must not create duplicate transcript jobs after a successful upload.
- Transcript creation retry must be safe only until a transcript id has been accepted.
- Polling already repeats while status is `queued` or `processing`; that progress polling is separate from per-request HTTP retry.
- Websocket streaming sessions do not use HTTP transport retry after connect; Fast/streaming dictation may fall back to the async path if streaming fails before a final transcript or the selected model is not streaming-capable.
- Activity retry uses the original saved audio for AssemblyAI instead of locally reprocessed retry segments.

### Deepgram

Provider id: `deepgram`

Speech endpoint:

- `POST https://api.deepgram.com/v1/listen`
- raw audio body
- `Authorization: Token {apiKey}`
- `Content-Type` from the normalized audio MIME type
- query parameters include `model`, `smart_format=true`, and optional `language`

Defaults and limits:

- default model: `nova-3`
- empty audio is an invalid local request
- missing channel alternatives or blank transcript is `invalid_provider_response`
- duration is normalized from seconds to milliseconds when present

Retry notes:

- Deepgram uses the shared transport retry helper with a fresh raw-audio request per attempt.
- It retries `429` and `5xx` according to the base policy.
- Do not retry empty or malformed normalized transcript responses.

### ElevenLabs

Provider id: `elevenlabs`

Speech endpoint:

- `POST https://api.elevenlabs.io/v1/speech-to-text`
- multipart upload with `file` and `model_id`
- optional `language_code`
- `xi-api-key` header

Defaults and limits:

- default model: `scribe_v2`
- max audio: 3 GB
- empty audio is an invalid local request
- blank response text is `invalid_provider_response`

Retry notes:

- ElevenLabs uses the shared transport retry helper with a fresh multipart request per attempt.
- It retries `429` and `5xx` according to the base policy.
- Do not retry empty transcript or malformed response.

### Smallest AI

Provider id: `smallest`

Speech endpoint:

- `POST https://api.smallest.ai/waves/v1/stt/`
- bearer auth
- raw audio body
- `Content-Type: application/octet-stream`
- query parameters include `model`, `language`, `word_timestamps=false`, `format=true`, `punctuate=true`, and `capitalize=true`

Defaults and limits:

- default model: `pulse`
- selectable batch models: `pulse`, `pulse-pro`
- default language: `en`
- empty audio is an invalid local request
- blank `transcription` is `invalid_provider_response`
- `audio_length` is normalized from seconds to milliseconds when present

Retry notes:

- Smallest AI uses the shared `send_provider_request_with_retry` helper with a fresh raw-audio request per attempt.
- It retries `429` and `5xx` according to the base policy.
- It preserves `retryAfterMs` for rate-limit responses when available.
- Invalid JSON is `provider_request_failed` with a sanitized unreadable-response message.
- Response logging reports JSON keys or a bounded body summary, not full provider payloads.

## Future Providers

New providers should get a section here before or alongside implementation.

For each provider, document:

- provider id
- endpoint shape
- auth header shape
- request body shape
- default model
- max audio limit
- supported language and prompt fields
- empty transcript behavior
- malformed response behavior
- transport retry behavior
- activity retry exceptions, if any

If a provider has asynchronous jobs, webhooks, uploaded audio URLs, or non-idempotent creation calls, document exactly which steps are safe to retry and which are only safe to poll.
