# Development Guide

This document covers local setup and the **current development tasks**. It complements `docs/ROADMAP.md`.

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

## Common Issues

- Port 1420 already in use:
  - `taskkill /PID <PID> /F`, or
  - `set VITE_PORT=1421` then run `npm run tauri dev`.
- `link.exe` not found:
  - Install Build Tools with C++ workload, or run the VS dev shell.
- `kernel32.lib` missing:
  - Install a Windows SDK and use the VS dev shell.

## Current Focus: Phase 1 (Windows OS Access Spike)

Goal: prove we can detect the focused text field and insert text into it.

### Tasks

1) **Focused field detection**
   - Implement Windows UI Automation integration in Rust.
   - Return: window title, control name, role/type, and a stable identifier.
2) **Text insertion**
   - Insert text into the focused field using UI Automation or input injection.
   - Provide a fallback path if UIA insertion fails.
3) **Rust ⇄ UI bridge**
   - Add Tauri commands in `apps/desktop/src-tauri/src/commands/`.
   - Add typed TS wrappers in `apps/desktop/src/lib/tauri/`.
4) **Minimal test UI**
   - A debug panel that shows focused field info.
   - A text box to send test insertion.

### Exit Criteria

- A Windows build can:
  - Detect the active text field in at least two apps (e.g., Notepad + Chrome).
  - Insert text with a single UI button press.

### Notes

- Windows code should live in `apps/desktop/src-tauri/src/platform/windows`.
- Keep platform APIs behind traits in `apps/desktop/src-tauri/src/platform/common`.
