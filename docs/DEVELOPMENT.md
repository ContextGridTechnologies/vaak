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

When a PostHog key is bundled, Vaak still defaults usage analytics and crash
reports to off until the user opts in during setup or from Settings.

For local development, keep the real values in the ignored
`apps/desktop/.env.development.local` file. Release workflows read
`VITE_POSTHOG_PUBLIC_KEY` and `VITE_POSTHOG_HOST` from GitHub Actions secrets;
do not commit a real environment file. The workflows set
`VITE_DISTRIBUTION_CHANNEL` to `github` or `microsoft_store` for the matching
artifact.

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

Public GitHub releases publish the Windows installer as
`Vaak-Windows-Setup.exe`. The raw `target/release/vaak-desktop.exe` binary is a
local build output and is not attached to releases.

Each release also publishes `Vaak-Windows-Setup.exe.sha256` so users can verify
the installer before running it.

### Microsoft Store package

Install Microsoft's WinApp CLI once:

```powershell
winget install --id Microsoft.WinAppCli --exact --source winget
```

The Store manifest version must match the desktop version with a fourth numeric
component. For example, desktop version `0.1.15` uses `0.1.15.0` in
`apps/desktop/store/Package.appxmanifest`.

Build the Store package from the repo root:

```powershell
npm --prefix apps/desktop run store:package
```

The output is `apps/desktop/store/Vaak.msix`. Tagged releases build the same
package and upload it as the `Vaak-Microsoft-Store-MSIX` workflow artifact.
Download that artifact, upload `Vaak.msix` to the existing Partner Center app,
update the release notes, and submit the update for certification. The workflow
does not publish to Partner Center automatically.

MSI is still possible later, but it is no longer part of the default local build
path. If you want MSI packaging again, install WiX and then re-enable an MSI
target in the Tauri bundle configuration or add a separate MSI-specific build path.

```powershell
winget install WiXToolset.WiXToolset
```

## Release Desktop Builds

Normal pushes and pull requests run validation only. Pushing a version tag that
matches `v*.*.*` creates or updates a GitHub Release.

Release assets:

- `Vaak-Windows-Setup.exe`
- `Vaak-Windows-Setup.exe.sha256`
- `Vaak-macOS-AppleSilicon-Preview.app.zip`
- `Vaak-macOS-AppleSilicon-Preview.app.zip.sha256`
- `Vaak-macOS-AppleSilicon-Preview.dmg`
- `Vaak-macOS-AppleSilicon-Preview.dmg.sha256`
- `Vaak-macOS-Intel-Preview.app.zip`
- `Vaak-macOS-Intel-Preview.app.zip.sha256`
- `Vaak-macOS-Intel-Preview.dmg`
- `Vaak-macOS-Intel-Preview.dmg.sha256`

The release workflow verifies that the pushed tag, `apps/desktop/package.json`,
`apps/desktop/src-tauri/tauri.conf.json`, Rust package metadata, and the Store
manifest all use the same version. It runs Cargo metadata with `--locked`, so a
stale `Cargo.lock` also fails the release. For example, tag `v0.1.0` requires
the desktop and Rust version sources to contain `0.1.0` and the Store manifest
to contain `0.1.0.0`.

Release procedure:

1. Bump `apps/desktop/package.json`.
2. Bump `apps/desktop/src-tauri/tauri.conf.json`.
3. Bump `apps/desktop/src-tauri/Cargo.toml`, then refresh
   `apps/desktop/src-tauri/Cargo.lock` with `cargo check`.
4. Bump `apps/desktop/store/Package.appxmanifest` using the four-component Store
   version.
5. Commit the version change.
6. Create and push a version tag:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

The latest desktop download URLs are:

```text
https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-Windows-Setup.exe
https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-Windows-Setup.exe.sha256
https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-macOS-AppleSilicon-Preview.dmg
https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-macOS-AppleSilicon-Preview.dmg.sha256
https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-macOS-Intel-Preview.dmg
https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-macOS-Intel-Preview.dmg.sha256
```

Early Windows installers are unsigned, so Windows may show a SmartScreen warning
until code signing is added.

macOS preview builds are also unsigned. Testers may need to allow the app from
macOS Privacy & Security until signing and notarization are added.

Mac tester procedure:

1. Download the Apple Silicon `.dmg` for Apple Silicon Macs or the Intel `.dmg`
   for Intel Macs.
2. Download the matching `.sha256` file and verify the digest:

```bash
shasum -a 256 Vaak-macOS-AppleSilicon-Preview.dmg
shasum -a 256 Vaak-macOS-Intel-Preview.dmg
```

3. Open the `.dmg`, move Vaak to Applications, then launch it.
4. If macOS blocks the unsigned app, allow Vaak from System Settings > Privacy
   & Security and launch it again.
5. Grant Microphone, Accessibility, and Input Monitoring when prompted or from
   System Settings > Privacy & Security.
6. Validate local mode, provider key storage, microphone capture, global
   hold-to-talk, focused target capture, and insertion into a real text field.

For unsigned Windows releases, include a clear SmartScreen note in the release
body. Users should expect `Publisher: Unknown publisher` until code signing is
added. Also include a checksum verification command:

```powershell
Get-FileHash .\Vaak-Windows-Setup.exe -Algorithm SHA256
```

The expected SHA256 digest should match the uploaded
`Vaak-Windows-Setup.exe.sha256` release asset.

## Where to Find Planning and Status

- Product roadmap: `docs/ROADMAP.md`
- Positioning: `docs/POSITIONING.md`
- Product baseline: `docs/OPEN_SOURCE_PRODUCT_BASELINE.md`
- Provider strategy: `docs/PROVIDER_STRATEGY.md`
- Model-call retry base: `docs/MODEL_CALLING_RETRY_BASE.md`
- Provider-specific retry notes: `docs/PROVIDER_SPECIFIC_RETRY.md`
- Architecture details: `docs/ARCHITECTURE.md`
- Repo layout conventions: `docs/PROJECT_STRUCTURE.md`

## GitHub Issue Intake

Public issue templates live in `.github/ISSUE_TEMPLATE/`.

- Bug reports collect release version, install source, system details, expected
  behavior, actual behavior, and reproduction steps.
- Feature requests collect the workflow problem, proposed behavior, alternatives,
  and local-first/provider context.

Blank issues are disabled for public contributors so early feedback stays
structured. Maintainers with write access can still open blank issues from the
template chooser when needed.

## Common Issues

- Port 1420 already in use:
  - `taskkill /PID <PID> /F`, or
  - `set VITE_PORT=1421` then run `npm run tauri dev`.
- `link.exe` not found:
  - Install Build Tools with C++ workload, or run the VS dev shell.
- `kernel32.lib` missing:
  - Install a Windows SDK and use the VS dev shell.
