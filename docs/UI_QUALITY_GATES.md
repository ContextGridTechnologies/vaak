# UI Quality Gates

These checks are required before merging desktop UI changes.

## Commands

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

## Current Coverage

- `typecheck`: verifies TypeScript contracts across the desktop UI.
- `lint`: catches static JavaScript/TypeScript issues in `src`, Vite config, and desktop scripts.
- `test`: runs focused Vitest tests with React Testing Library.
- `build`: verifies the production Vite build.

## Test Scope

Current tests cover:

- Error normalization behavior.
- `StatusBadge` rendering and semantic status class usage.
- `JsonPreview` empty and populated states.

## Next Quality Additions

- Add tests for `useDictationSession` after dictation behavior stabilizes.
- Add Playwright smoke tests once the app shell has production routes or stable tab workflows.
- Add CI after repository hosting is configured.
