# Vaak Project Structure

Vaak is a Tauri desktop app with a React/TypeScript frontend and Rust native
capabilities. The backend is intentionally absent from the critical path until
the local BYOM dictation loop is working.

## Current Layout

```text
.
├─ apps/
│  └─ desktop/
│     ├─ src/                    # React/Vite frontend
│     │  ├─ app/                 # app shell and layout
│     │  ├─ components/          # reusable UI
│     │  ├─ features/            # product features
│     │  ├─ hooks/               # browser/device hooks
│     │  └─ lib/                 # utilities and Tauri wrappers
│     └─ src-tauri/
│        ├─ src/                 # Rust native capabilities
│        │  ├─ commands/         # Tauri command surface
│        │  ├─ platform/         # OS-specific focus/insertion code
│        │  └─ session.rs        # session and hotkey state
│        └─ capabilities/        # Tauri permissions
├─ packages/
│  ├─ shared/                    # future shared types
│  └─ ui-kit/                    # future reusable UI package
├─ docs/                         # active product and engineering docs
└─ scripts/                      # local tooling
```

## Intended Next Additions

For Milestone 1, prefer adding frontend/provider orchestration before a
backend service:

```text
apps/desktop/src/features/providers/
apps/desktop/src/features/settings/
apps/desktop/src/features/personalization/
apps/desktop/src/lib/providers/
apps/desktop/src/lib/storage/
```

Suggested responsibilities:

- `features/providers`: provider selection and status UI.
- `features/settings`: local settings, provider credentials, hotkeys.
- `features/personalization`: dictionary, snippets, styles.
- `lib/providers`: provider interfaces and client implementations.
- `lib/storage`: local config and secure credential wrappers.

## Boundary Rules

- UI code should call typed helper functions, not raw Tauri `invoke()` directly.
- Provider code should normalize external API responses into internal types.
- BYO API keys must go through secure storage helpers.
- Rust owns OS-level capabilities such as focus detection and text insertion.
- TypeScript can own early provider integrations for speed of iteration.
- Backend code should live under `services/api` only after Milestone 1 is done.

## Future Backend Layout

When backend work starts:

```text
services/
└─ api/
   ├─ src/
   │  ├─ auth/
   │  ├─ sync/
   │  ├─ managed/
   │  ├─ billing/
   │  └─ usage/
   └─ package.json
```

The backend must not become required for local dictation.
