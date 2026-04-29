## Run

Install the desktop app dependencies once:

```bash
npm run install:desktop
```

Start the project from the repo root:

```bash
npm run dev
```

This starts the React/Vite preview on `http://127.0.0.1:1420`.

Native Tauri features like window control, focused-field capture, and text
insertion require Rust/Cargo and the Tauri shell:

```bash
npm run tauri dev
```

If PowerShell has not reloaded the Rust install path yet, the repo's Tauri
launcher will prepend `%USERPROFILE%\\.cargo\\bin` automatically.
