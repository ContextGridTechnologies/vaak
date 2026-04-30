# Security And Privacy

## Security Model

Vaak must be safe for local-first use before cloud features exist.

The core rule is simple: local BYO-model usage should not require Vaak servers.

## Secrets

BYO provider API keys must be stored using OS-backed secure storage where
available:

- Windows Credential Manager.
- macOS Keychain.
- Linux Secret Service if Linux support is added.

Do not store provider keys in:

- browser localStorage
- logs
- crash reports
- synced settings
- plaintext config files

## Data Handling

Local mode:

- Audio is sent only to the selected transcription provider.
- Transcript text is sent only to the selected rewrite provider.
- Raw audio should not be retained by default.
- Raw transcripts should not be synced by default.
- Focused app context should be minimized.

Managed cloud mode:

- The user must be signed in.
- Requests are processed by Vaak servers.
- Usage must be metered.
- Provider keys are server-side and owned by Vaak.
- Logs must redact user content unless explicit diagnostic mode exists.

## Logging

Never log:

- API keys
- authorization headers
- raw audio
- full transcripts by default
- focused-field contents by default

Allowed logs:

- provider id
- stage name
- status code
- latency
- redacted error class
- request id

## Abuse And Cost Controls

Before managed cloud launch, implement:

- user quotas
- fair-use limits
- rate limits
- request size limits
- provider timeout limits
- billing status checks
- basic anomaly detection

These controls are part of profitability, not optional infrastructure polish.

## Open-Source Trust Rules

- Make local-only behavior clear in docs.
- Make network calls visible in code paths.
- Keep provider interfaces understandable.
- Avoid hidden telemetry.
- Make telemetry opt-in if added.
