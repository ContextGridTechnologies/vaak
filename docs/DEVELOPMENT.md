# Development Guide

This document covers local setup and troubleshooting. Phase plans and status live under `docs/phases/`.

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

## Build the App

```powershell
cd apps/desktop
npm run build
```

## Where to Find Planning and Status

- Product roadmap: `docs/ROADMAP.md`
- Phase-by-phase execution and progress: `docs/phases/`
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
