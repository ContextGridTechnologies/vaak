# Vaak

Open-source, local-first voice input for desktop workflows.

Vaak turns speech into polished text and inserts it into the app you were
already using. The project is being built as a serious desktop productivity
tool: local-first by default, bring-your-own provider support for users who want
control, and optional account, sync, team, and managed cloud features later.

## Download

Download the latest Windows installer:
[Vaak-Windows-Setup.exe](https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-Windows-Setup.exe)

All release builds are available from the
[GitHub releases page](https://github.com/ContextGridTechnologies/vaak/releases).

Early Windows installers are unsigned, so Windows may show a SmartScreen warning
until code signing is added.

### Windows SmartScreen

The current Windows installer is unsigned. If Windows shows "Windows protected
your PC" with `Publisher: Unknown publisher`, that is expected for this early
release. It means Windows cannot verify a code-signing publisher identity yet;
it does not mean the installer failed.

Before running the installer, you can verify the downloaded file checksum:

```powershell
Get-FileHash .\Vaak-Windows-Setup.exe -Algorithm SHA256
```

Compare the result with the SHA256 digest listed on the GitHub Release asset.

## Status

Vaak is in early active development. The current milestone is the local
bring-your-own-model dictation loop:

- select local provider settings
- store provider credentials securely
- capture microphone input
- transcribe and optionally rewrite dictated text
- insert polished text into the focused desktop app

The core product should not require a Vaak account or hosted backend.

## Product Direction

Vaak is built around a few public commitments:

- Open-source desktop app.
- Local-first workflow by default.
- Bring your own transcription and model providers.
- Provider adapters behind one internal provider interface.
- Optional cloud features for sync, managed usage, billing, and teams later.
- Production-grade desktop UX rather than a demo shell.

Current provider targets include OpenAI, Deepgram, and Groq. Additional
providers should fit behind the same internal provider boundaries.

## Repository Layout

```text
.
+-- apps/
|   +-- desktop/      # Tauri desktop app with React, TypeScript, and Rust
+-- packages/        # Shared packages and future reusable UI/shared code
+-- docs/            # Product, architecture, security, and roadmap docs
+-- scripts/         # Local project tooling
+-- output/          # Local generated artifacts, not committed
```

Useful docs:

- `docs/ROADMAP.md`
- `docs/POSITIONING.md`
- `docs/OPEN_SOURCE_PRODUCT_BASELINE.md`
- `docs/PROVIDER_STRATEGY.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/SECURITY.md`

## Prerequisites

- Node.js 20.19.0 or newer
- npm 10 or newer
- Rust toolchain through rustup
- Visual Studio Build Tools 2022 on Windows, including C++ build tools and a
  Windows SDK

## Getting Started

Install the desktop dependencies from the repo root:

```powershell
npm run install:desktop
```

Start the Vite development server:

```powershell
npm run dev
```

This serves the React app on `http://127.0.0.1:1420`.

For native desktop behavior such as window control, hotkeys, focused-field
capture, and text insertion, run the Tauri shell:

```powershell
npm run tauri dev
```

If PowerShell has not reloaded the Rust install path yet, the repo's Tauri
launcher prepends `%USERPROFILE%\.cargo\bin` automatically.

## Windows Packaging

Local Windows packaging defaults to NSIS rather than WiX/MSI. Install NSIS with
`winget install NSIS.NSIS`, then run `npm run tauri:build` from the repo root.

Expected outputs:

- NSIS installer: `apps/desktop/src-tauri/target/release/bundle/nsis/`
- Direct desktop binary: `apps/desktop/src-tauri/target/release/vaak-desktop.exe`

Public GitHub releases publish only the Windows installer as
`Vaak-Windows-Setup.exe`.

MSI is optional later if you install WiX with
`winget install WiXToolset.WiXToolset` and re-enable an MSI-specific packaging
path.

## Verification

Run the smallest meaningful check for your change. The main repo commands are:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

For Rust or Tauri backend changes, also run:

```powershell
cd apps/desktop/src-tauri
cargo check
```

## Contributing

Vaak is not ready for broad public contribution yet, but the codebase should be
kept contributor-readable now.

When changing the project:

- Keep local dictation usable without login or hosted services.
- Keep provider-specific code behind provider adapters.
- Store BYO API keys through secure storage helpers, not browser storage.
- Put reusable UI in shared components instead of one-off feature markup.
- Keep public copy aligned with open-source, local-first desktop workflows.
- Avoid committing generated screenshots, scratchpads, or local debug output.

See `AGENTS.md` and `docs/DEVELOPMENT.md` for more detailed development
guidance.

## License

Apache-2.0. See `LICENSE`.
