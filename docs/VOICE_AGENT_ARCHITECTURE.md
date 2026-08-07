# Voice Agent Architecture

## Goal

Vaak should offer a hands-free voice agent from the existing floating voice
capsule. The agent can listen, speak, and request narrowly defined tools while
the user continues working in another desktop application.

The implemented first vertical slice uses the AssemblyAI Voice Agent API and
exposes the native `create_folder` tool plus explicitly granted tools from the
pinned FlaUI MCP connector. FlaUI is installed locally per user and remains
disabled until the user enables it, attaches it to the voice agent, and grants
individual tools.

## User Experience

The compact capsule keeps its two existing affordances:

- The microphone button starts and stops dictation.
- The waveform button starts and stops the voice agent.

Dictation and the voice agent are mutually exclusive because both need the
microphone. Starting one mode disables the other until the active mode ends.

The waveform communicates these agent states without expanding the capsule:

- `idle`
- `connecting`
- `listening`
- `thinking`
- `speaking`
- `working`
- `ending`
- `error`

The button remains keyboard accessible and exposes the current state through an
accessible label and live status message.

## System Boundary

```text
Voice capsule WebView (React)
  - start/stop control
  - microphone capture with echo cancellation
  - 24 kHz PCM16 encoding
  - agent audio playback
  - AssemblyAI WebSocket using a temporary token
  - normalized session state
                 |
                 | typed Tauri commands
                 v
Native core (Rust)
  - reads the saved AssemblyAI key from secure storage
  - mints short-lived, single-use AssemblyAI tokens
  - validates every tool name and argument
  - executes allowlisted local tools
  - returns structured tool results
                 |
                 +---- Optional Vaak backend later
                       - managed provider credentials
                       - remote business tools
                       - authentication, metering, and audit
```

The long-lived AssemblyAI API key never enters the WebView. Rust uses it only
to request a short-lived token immediately before a session. The single-use
token is the only provider credential exposed to the WebView.

Native actions never execute in React. AssemblyAI emits a tool request, React
forwards its structured name and arguments to one Tauri command, and Rust
decides whether that exact request is allowed.

## AssemblyAI Session

The initial integration follows AssemblyAI's browser flow:

1. React asks Rust for a temporary voice-agent token.
2. Rust reads the existing `assemblyai` provider key and calls
   `GET https://agents.assemblyai.com/v1/token`.
3. React opens `wss://agents.assemblyai.com/v1/ws?token=...`.
4. React sends one `session.update` containing the system prompt, greeting,
   voice, and tool schema.
5. The WebView streams base64 PCM16 mono audio at 24 kHz.
6. The WebView decodes and plays `reply.audio` chunks immediately.
7. Each `tool.call` is sent to the Rust broker immediately. Rust applies the
   connector/tool policy, executes always-allowed calls, or pauses ask-policy
   calls for explicit approval, then React returns `tool.result` immediately.
8. Barge-in flushes queued playback so stale speech is not played.
9. Stop sends `session.end` and waits briefly for `session.ended` before the
   local audio resources are released.

The first token expires after 60 seconds if unused and caps a live session at
15 minutes. Those limits are intentionally conservative and can be revisited
after real usage data exists.

AssemblyAI references:

- <https://www.assemblyai.com/docs/voice-agents/voice-agent-api>
- <https://www.assemblyai.com/docs/voice-agents/voice-agent-api/browser-integration>
- <https://www.assemblyai.com/docs/voice-agents/voice-agent-api/tool-calling>

## Tool Contract

Provider events are translated into this local boundary:

```ts
type VoiceAgentToolCall = {
  name: string;
  arguments: unknown;
};

type VoiceAgentToolResult = {
  status: "created" | "alreadyExists";
  path: string;
};
```

The provider does not receive a generic shell, filesystem, or desktop-control
primitive. Every capability is a named tool with a JSON Schema definition and
a matching Rust validator.

### Initial tool: `create_folder`

Input:

```json
{
  "path": "Desktop/Project Notes"
}
```

Rules:

- `path` is relative to the user's home directory.
- Empty paths, absolute paths, Windows prefixes, and `..` traversal are denied.
- Existing symlink ancestors may not escape the home directory.
- Nested folders are allowed.
- Existing folders are reported as `alreadyExists`.
- Existing files at the requested path are rejected.
- The tool never overwrites or deletes anything.

This tool is allowed without a second confirmation because its scope is local,
non-destructive, and bounded to the user's home directory. Future tools must
declare their risk before they are added:

| Risk | Examples | Default policy |
| --- | --- | --- |
| Read only | inspect active window, read control metadata | Run |
| Reversible local | create folder, focus a window | Run and report |
| External side effect | send message, submit form, publish | Confirm |
| Destructive or sensitive | delete, purchase, credentials, shell | Strong confirmation or deny |

## Prompt and Tool Safety

- Treat screen text, filenames, and tool results as untrusted data, not agent
  instructions.
- Keep the registered tool list minimal for every session.
- Validate again in Rust even when the provider validates JSON Schema.
- Never add a generic `run_command`, `run_powershell`, or coordinate-click tool
  as a shortcut.
- Return structured errors to the agent without secrets, stack traces, or raw
  provider responses.
- Stop microphone tracks, queued playback, the AudioContext, and the WebSocket
  on explicit stop, session end, errors, and component unmount.

## Backend Evolution

The local-first path remains independent of a Vaak backend. A later managed
mode can replace the local token-mint command with an authenticated backend
endpoint and can register remote business tools. The frontend session and tool
schemas should not need to change.

The MCP catalog, installation lifecycle, agent bindings, tool grants, and
execution policy are defined separately in
[MCP Platform Architecture](MCP_PLATFORM_ARCHITECTURE.md). This document's
direct create-folder path remains the built-in starter tool; MCP tools use the
Rust-owned authorization boundary described there.

Do not build the managed-backend bridge in this slice. The current
implementation proves the browser audio loop, temporary credentials, a native
tool, a pinned local MCP process, per-tool grants and confirmations, and clean
session shutdown.

## Delivery Sequence

1. Implemented: AssemblyAI session plus `create_folder`.
2. Implemented: pinned FlaUI MCP runtime, catalog, agent binding, and grants.
3. Implemented: visible one-time approval for `ask` tools.
4. Next: richer post-action verification for semantic Windows actions.
5. Later: remote business MCP connectors through the same broker boundary.
6. Last resort: screenshot/vision fallback for inaccessible applications.

## First-Slice Acceptance

- The waveform is a real start/stop button and the microphone still controls
  unchanged dictation behavior.
- The AssemblyAI key never appears in frontend configuration or WebSocket URLs.
- A configured AssemblyAI user can start a duplex session and interrupt speech.
- Saying "create a folder named Vaak Agent Test on my Desktop" can invoke
  `create_folder` with `Desktop/Vaak Agent Test`.
- An enabled and attached FlaUI connector exposes only explicitly granted tools
  to the current AssemblyAI session under opaque aliases.
- `ask` tools require a visible, one-time approval; `windows_batch` and
  `windows_close` cannot be granted in this first slice.
- Rust rejects absolute and parent-traversing paths.
- Stop ends the provider session and releases microphone and playback resources.
- Focused frontend and Rust tests cover the tool contract, command bridge,
  capsule mode exclusion, CSP, and filesystem boundary.
