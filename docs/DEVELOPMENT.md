# Development Guide

This document covers local setup and troubleshooting. Active product planning
lives in the top-level docs listed below.

## Prerequisites (Windows)

- Node.js **20.19.0+** (npm 10+)
- Rust toolchain (rustup)
- Visual Studio Build Tools 2022:
  - Desktop development with C++
  - MSVC v143 (x64/x86)
  - Windows SDK (10 or 11)

## Verify Toolchain

```powershell
node -v
npm -v
rustc -V
cargo -V
where link
```

If `where link` returns nothing, use the VS dev shell:

```powershell
cmd /c "call \"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat\" && where link"
```

## Run the App (Dev)

```powershell
cd apps/desktop
npm install
npm run tauri dev
```

## Environment Configuration

Vaak keeps environment variables for app/runtime configuration only. Provider
API keys must stay in the OS keyring through the app UI; do not put provider
keys in `.env` files or `VITE_*` variables.

Committed examples live in:

- `apps/desktop/.env.example`
- `apps/desktop/.env.development.example`
- `apps/desktop/.env.production.example`

Local real env files are ignored by Git:

- `apps/desktop/.env.development`
- `apps/desktop/.env.production`
- `apps/desktop/.env.local`

Frontend values use `VITE_*` and are bundled into the WebView. Treat them as
public. Backend/runtime values use `VAAK_*` and are read by the Tauri process
when the process environment provides them.

PostHog product analytics is optional. Set `VITE_POSTHOG_PUBLIC_KEY` to the
public project key for packaged builds and leave it blank to disable analytics.
Use `VITE_POSTHOG_HOST` for the selected PostHog region, for example
`https://us.i.posthog.com` or `https://eu.i.posthog.com`.

Production-safe defaults:

```powershell
VITE_APP_ENV=production
VITE_ENABLE_DEBUG_UI=false
VITE_POSTHOG_PUBLIC_KEY=
VITE_POSTHOG_HOST=https://us.i.posthog.com
VAAK_APP_ENV=production
VAAK_LOG_LEVEL=info
VAAK_UPDATE_CHANNEL=stable
VAAK_ENABLE_TELEMETRY=false
```

Processed audio artifacts are development-only. In production, Vaak may still
use processed audio in memory for transcription quality, but it does not persist
or expose the processed audio artifact in the activity feed.

## Build the App

```powershell
cd apps/desktop
npm run build
```

## Package the Windows App

Local Windows packaging now defaults to an NSIS installer, so `npm run tauri:build`
does not require WiX tooling.

Install NSIS once:

```powershell
winget install NSIS.NSIS
```

Build the Windows package from the repo root:

```powershell
npm run tauri:build
```

Expected outputs:

- NSIS installer: `apps/desktop/src-tauri/target/release/bundle/nsis/`
- Direct desktop binary: `apps/desktop/src-tauri/target/release/vaak-desktop.exe`

Public GitHub releases publish only the Windows installer as
`Vaak-Windows-Setup.exe`. The raw `target/release/vaak-desktop.exe` binary is a
local build output and is not attached to releases.

MSI is still possible later, but it is no longer part of the default local build
path. If you want MSI packaging again, install WiX and then re-enable an MSI
target in the Tauri bundle configuration or add a separate MSI-specific build path.

```powershell
winget install WiXToolset.WiXToolset
```

## Release the Windows Installer

Normal pushes and pull requests run validation only. Pushing a version tag that
matches `v*.*.*` creates or updates a GitHub Release and uploads the Windows
NSIS installer as `Vaak-Windows-Setup.exe`.

Release procedure:

1. Bump `apps/desktop/package.json`.
2. Bump `apps/desktop/src-tauri/tauri.conf.json`.
3. Commit the version change.
4. Create and push a version tag:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

The latest installer URL is:

```text
https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-Windows-Setup.exe
```

Early Windows installers are unsigned, so Windows may show a SmartScreen warning
until code signing is added.

## Where to Find Planning and Status

- Product roadmap: `docs/ROADMAP.md`
- Positioning: `docs/POSITIONING.md`
- Product baseline: `docs/OPEN_SOURCE_PRODUCT_BASELINE.md`
- Provider strategy: `docs/PROVIDER_STRATEGY.md`
- Architecture details: `docs/ARCHITECTURE.md`
- Repo layout conventions: `docs/PROJECT_STRUCTURE.md`

## Common Issues

- Port 1420 already in use:
  - `taskkill /PID <PID> /F`, or
  - `set VITE_PORT=1421` then run `npm run tauri dev`.
- `link.exe` not found:
  - Install Build Tools with C++ workload, or run the VS dev shell.
- `kernel32.lib` missing:
  - Install a Windows SDK and use the VS dev shell.
