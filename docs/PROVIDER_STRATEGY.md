# Provider Strategy

## Decision

Use one internal Vaak provider system with separate provider adapters.

Do not build the app directly around OpenAI, Deepgram, Groq, or any specific
vendor. The app should depend on Vaak-owned interfaces, and each vendor should
live behind an adapter.

## Why

This gives us:

- a clean UI
- easier provider switching
- easier testing
- lower vendor lock-in
- easier community contributions
- a future path to local models
- a future path to managed cloud routing

## Shape

The app should have two provider categories first:

- speech-to-text providers
- rewrite/model providers

Conceptual interfaces:

```ts
type SpeechToTextProvider = {
  id: string;
  label: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptResult>;
};

type TextRewriteProvider = {
  id: string;
  label: string;
  rewrite(input: RewriteInput): Promise<RewriteResult>;
};
```

Provider adapters:

```text
providers/
  speech/
    openai.ts
    deepgram.ts
    groq.ts
  rewrite/
    openai-compatible.ts
    groq.ts
  registry.ts
  types.ts
```

## First Providers

### OpenAI

Use for:

- transcription
- rewrite/model

### Deepgram

Use for:

- transcription

### Groq

Use for:

- transcription
- fast rewrite/model where the API path supports it

## Registry Pattern

Use a registry so UI can list provider options without importing every adapter
directly:

```ts
const speechProviders = {
  openai: createOpenAISpeechProvider,
  deepgram: createDeepgramSpeechProvider,
  groq: createGroqSpeechProvider,
};
```

The UI should receive provider metadata:

- id
- label
- category
- required credentials
- supported modes
- setup status

The pipeline should receive a concrete provider instance.

## Configuration

Separate secrets from non-secret config.

Non-secret local config:

- selected speech provider id
- selected rewrite provider id
- selected model name
- endpoint URL for compatible providers
- enabled features

Secret storage:

- API keys
- access tokens

Secrets must go through secure storage, not browser localStorage.

## Testing

Provider adapters should be tested with:

- mocked successful responses
- auth failure
- rate limit
- empty transcript
- malformed response
- timeout

The dictation pipeline should only test against normalized provider results.

## Future

Later providers should be straightforward additions:

- AssemblyAI
- ElevenLabs speech-to-text if needed
- local Whisper
- Ollama
- LM Studio
- self-hosted OpenAI-compatible endpoints

The provider system should make these additions boring.
