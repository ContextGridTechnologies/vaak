# Vaak Desktop

This is the Tauri desktop app for Vaak.

The frontend is React, TypeScript, Tailwind CSS, and shadcn/ui. Native desktop
capabilities live in `src-tauri` and are exposed through typed Tauri helpers in
the frontend.

## Local Development

Install dependencies from the repo root:

```powershell
npm run install:desktop
```

Run the web UI only:

```powershell
npm run dev
```

Run the native Tauri app:

```powershell
npm run tauri dev
```

## Checks

From the repo root:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

For Rust-side changes:

```powershell
cd apps/desktop/src-tauri
cargo check
```

## Notes

- Local-first dictation must remain usable without a Vaak account.
- Provider integrations should go through the internal provider system.
- Native focus detection, text insertion, secure storage, and hotkey behavior
  belong in the Tauri side or typed Tauri helpers.
- Reusable UI should live under `src/components` or shared feature components
  before it is duplicated.
