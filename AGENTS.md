# Agent Instructions

## Product Direction

Vaak is an open-source, local-first voice input layer for desktop workflows. Position it as a serious voice productivity tool, not as a clone of any competitor.

Public language should emphasize:

- Open-source voice input for desktop workflows.
- Local-first by default.
- Bring your own model/API key support.
- Optional account, sync, team, and cloud features later.
- Production-grade desktop UX, not a demo or prototype.

Avoid public docs or UI copy that frames the product as a competitor clone.

## Repository Shape

- Desktop app: `apps/desktop`
- Tauri backend: `apps/desktop/src-tauri`
- Shared packages: `packages`
- Public docs: `docs`
- Local/generated artifacts: `output`

Use existing architecture and naming conventions before introducing new patterns.

## Public vs Local Docs

Keep public strategic docs in Git when they describe product direction, roadmap, architecture, security, provider strategy, or contribution-level guidance.

Do not commit task-level execution notes, implementation scratchpads, temporary planning files, generated screenshots, or local debugging artifacts unless explicitly requested.

Current local-only/generated areas include:

- `output/`
- `.playwright-cli/`
- Local screenshot/debug helpers when excluded by `.git/info/exclude`
- Task-level docs such as implementation plans and phase scratchpads

## Engineering Standard

Build as if the project will be reviewed by external contributors:

- Prefer typed boundaries and explicit data structures.
- Keep feature code modular and reusable.
- Put reusable UI in global/shared components instead of embedding one-off markup in feature files.
- Keep changes scoped to the requested behavior.
- Do not hide errors silently; expose recoverable errors clearly.
- Avoid unrelated refactors.
- Never revert user changes unless explicitly asked.

## UI Standard

The first screen should feel like a production desktop tool:

- Clean, dense, and workflow-focused.
- No marketing landing page inside the app shell.
- Use the existing shadcn/Tailwind setup.
- Use lucide icons where an icon is appropriate.
- Keep visible navigation minimal until features are real.
- Current visible app sections should be `Voice` and `Settings`; `Commands` and `Diagnostics` can exist in code but should stay hidden until ready.
- Recorder internals should remain hidden for now. Future capture UX should move toward a floating voice control/overlay.

All important UI changes should be checked with screenshots across desktop and mobile-sized viewports when practical.

## Provider Strategy

Use one internal provider interface and separate provider adapters.

Initial provider targets:

- OpenAI
- Deepgram
- Groq

Users should be able to bring their own API keys. Do not design the core local product so it requires a Vaak account or hosted backend.

## Backend Strategy

Backend/cloud should be optional at first. Prioritize local desktop functionality before account systems.

Cloud/backend work should support:

- Accounts and billing later.
- Optional settings sync.
- Optional team/admin features.
- Optional hosted transcription or rewrite credits.

Do not make cloud auth a blocker for local dictation.

## Verification Commands

Run the smallest meaningful verification for the change:

```powershell
npm run typecheck
npm --prefix apps/desktop run lint
npm run test
npm run build
```

For Tauri/Rust changes, also run:

```powershell
cargo check
```

from `apps/desktop/src-tauri` or through the repo's established Tauri workflow.

## Local Screenshot Helper

If present locally, use:

```powershell
node apps/desktop/scripts/screenshot-app.mjs --mode desktop --name ui-check
node apps/desktop/scripts/screenshot-app.mjs --mode mobile --name mobile-check --no-full-page
node apps/desktop/scripts/screenshot-app.mjs --mode all --name full-pass
```

Screenshots should go to `output/playwright/` and should not be committed.

## Git Hygiene

- Check `git status --short` before committing.
- Stage only files relevant to the requested change.
- Keep public roadmap and product docs commit-ready.
- Keep private implementation scratchpads untracked unless the user explicitly changes that policy.
- Do not commit generated screenshots or local debug output.
