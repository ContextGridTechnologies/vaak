# BlueVoice.ai — Project Structure (Tauri + TypeScript + Rust)

This document defines the **production-oriented repository structure** for a cross-platform “voice OS” desktop application targeting **Windows** and **macOS** first (Linux optional later). It is designed to keep:

- **UI/product code** in TypeScript (fast iteration).
- **native/system integrations** in Rust (Tauri commands/plugins), with OS-specific modules isolated.
- A clear path to a future **backend** (accounts, billing, policies) without rewriting the desktop app.

## Goals

- Cross-platform desktop app built with **Tauri 2**, **Rust**, and **TypeScript**.
- OS-level capabilities: microphone capture, global shortcuts, accessibility-based focus detection, and text injection.
- LLM/STT integrations: cloud-first initially (API-key driven), with a path to optional local models.
- Security: API keys stored in OS keychain/credential vault; least-privilege permissions.
- Maintainability: clean separation between UI, orchestration, and OS integrations.

## High-Level Architecture

The app is split into 4 layers:

1) **UI (TypeScript)**  
   - Views, onboarding, settings, permissions UI, status widgets.
   - Calls native capabilities via Tauri `invoke()` and events.

2) **App Core (Rust, shared)**  
   - Orchestration: session state, command routing, logging, configuration, pipelines (STT → LLM → action).
   - Exposes stable “capability APIs” to UI (e.g., `dictation.start`, `context.getFocusedField`, `system.setTheme`).

3) **OS Integrations (Rust, per OS)**  
   - Windows: UI Automation, text services/injection, global hotkeys, mic permissions.
   - macOS: Accessibility (AX), CGEvent, Input Monitoring, mic permissions.

4) **Providers (TS/Rust)**  
   - STT providers, LLM providers, TTS providers, telemetry (optional).
   - Initially cloud providers with user-supplied API keys; later can add backend-issued keys.

## Repository Layout (Proposed)

```
.
├─ apps/
│  └─ desktop/                        # The Tauri desktop app (Windows/macOS)
│     ├─ src/                         # TypeScript UI (React/Vite recommended)
│     │  ├─ app/                      # App shell, routing, layout
│     │  ├─ features/                 # Feature modules (dictation, commands, settings)
│     │  ├─ components/               # Reusable UI components
│     │  ├─ hooks/                    # React hooks (permissions, hotkeys, device state)
│     │  ├─ state/                    # State management (Zustand/Redux/etc.)
│     │  ├─ styles/                   # Theme, tokens, global styles
│     │  ├─ lib/
│     │  │  ├─ tauri/                 # Typed wrappers around invoke/events
│     │  │  ├─ config/                # UI config + defaults
│     │  │  └─ logging/               # UI logging facade
│     │  └─ main.tsx
│     ├─ public/
│     ├─ src-tauri/
│     │  ├─ src/
│     │  │  ├─ main.rs
│     │  │  ├─ commands/              # Tauri commands exposed to UI
│     │  │  ├─ core/                  # Orchestration (pipeline, state, services)
│     │  │  ├─ platform/              # OS abstraction + dispatch
│     │  │  │  ├─ windows/            # Windows-only integration (cfg(windows))
│     │  │  │  ├─ macos/              # macOS-only integration (cfg(target_os="macos"))
│     │  │  │  └─ common/             # Shared helpers + traits
│     │  │  ├─ providers/             # STT/LLM/TTS provider clients (optional in Rust)
│     │  │  ├─ storage/               # Secure storage wrappers (keychain/cred mgr)
│     │  │  ├─ telemetry/             # Optional metrics + crash reporting hooks
│     │  │  └─ utils/
│     │  ├─ capabilities/             # Tauri plugin configuration / permissions
│     │  ├─ tauri.conf.json
│     │  └─ Cargo.toml
│     └─ package.json
│
├─ packages/
│  ├─ shared/                         # Shared TS types/utilities (UI + future backend)
│  │  ├─ src/
│  │  └─ package.json
│  └─ ui-kit/                         # Design system (optional)
│     ├─ src/
│     └─ package.json
│
├─ services/                          # Future backend services (not required v1)
│  └─ api/                            # e.g., FastAPI/Node/Go (placeholder)
│
├─ docs/
│  ├─ PROJECT_STRUCTURE.md
│  ├─ ARCHITECTURE.md                 # Deeper design (pipelines, events, security)
│  ├─ PERMISSIONS.md                  # OS permissions, prompts, and rationale
│  ├─ SECURITY.md                     # key storage, threat model, data handling
│  ├─ ROADMAP.md
│  └─ DEVELOPMENT.md                  # local setup + scripts
│
├─ tooling/
│  ├─ scripts/                        # release/versioning, lint, CI helpers
│  └─ ci/                             # GitHub Actions workflows (later)
│
├─ assets/
│  ├─ icons/                          # app icons, tray icons
│  └─ screenshots/
│
├─ .editorconfig
├─ .gitignore
└─ README.md
```

## What Goes Where (Rules)

### UI (TypeScript)

- `apps/desktop/src/features/` holds end-to-end features (dictation, command mode, settings).
- `apps/desktop/src/lib/tauri/` is the *only* place that talks to Tauri directly.
  - UI code imports typed functions like `startDictation()` rather than calling `invoke()` everywhere.
- `packages/shared/` contains shared types (e.g., `CommandIntent`, `DictationState`, `AppSettings`).

### Native (Rust)

- `src-tauri/src/commands/`: stable command surface exposed to UI (keep small, typed inputs/outputs).
- `src-tauri/src/core/`: orchestration; should not contain OS-specific code.
- `src-tauri/src/platform/`:
  - Contains traits like `FocusedFieldProvider`, `TextInjector`, `SystemController`, `MicrophoneController`.
  - Per-OS implementations under `windows/` and `macos/`.

### Provider strategy (LLM/STT/TTS)

Recommended in early versions:
- Implement provider *network calls* in TypeScript (fast iteration) and only keep secrets + OS access in Rust.

Recommended long-term:
- Move sensitive provider code into Rust (or into a backend) if you need stricter control/obfuscation, rate limiting, or unified networking.

## Cross-Platform/OS Strategy

- Keep a **capability-first API**: UI calls `capabilities` rather than “Windows/macOS”.
- For each capability, define:
  - Availability per OS.
  - Required permissions (Accessibility, Input Monitoring, Microphone).
  - Failure mode (helpful error messages, “open Settings” action).

## Permissions and Security (Production Expectations)

- API keys must be stored in secure OS storage:
  - Windows Credential Manager
  - macOS Keychain
- Logging must never include API keys or raw mic audio.
- Accessibility APIs require explicit user approval (macOS) and should be requested only when needed.

## Build and Release

Recommended:
- Monorepo package manager: `pnpm` (workspaces).
- UI: `Vite` + `React` + TypeScript.
- Versioning: single source of truth (workspace script that updates app + Cargo versions).
- Signing:
  - macOS: codesign + notarization (later)
  - Windows: code signing certificate (later)

## Rough Feature Modules (Names Only)

These folders are expected in `apps/desktop/src/features/`:

- `onboarding/` (permissions + first-run)
- `dictation/` (mic → STT → insert text)
- `command-mode/` (“Turn on dark mode”, “Open app”, etc.)
- `context/` (focused field + surrounding text)
- `settings/` (API keys, models, hotkeys)
- `tray/` (tray menu, quick toggle)

## Next Step

After agreeing on this structure, the next document should be `docs/ARCHITECTURE.md` to define:
- the dictation pipeline stages
- event model between UI ↔ Rust
- permission flows per OS
- typed command schemas and errors

