# UI Implementation Roadmap

This roadmap turns the Tailwind + shadcn/ui decision into a step-by-step implementation plan. The goal is a reusable, production-level UI foundation for a minimal BTC business desktop app.

Related docs:

- `docs/UI_THEME_DECISION.md`
- `docs/UI_THEME_CHECKLIST.md`
- `docs/UI_QUALITY_GATES.md`
- `docs/UI_SYSTEM_PLAN.md`

## Goals

- Build the app on Tailwind CSS v4 and shadcn/ui v4 Radix.
- Keep the UI minimal, fluid, compact, and business-focused.
- Make theme changes easy by using semantic tokens instead of raw colors.
- Keep low-level UI primitives reusable and feature-agnostic.
- Keep feature components readable, testable, and easy to replace.
- Avoid premature extraction into `packages/ui-kit` until there is a real second consumer.

## Current Progress

- Phase 0: completed.
- Phase 1: completed.
- Phase 2: completed.
- Phase 3: completed.
- Phase 4: completed.
- Phase 5: completed.
- Phase 6: completed.
- Phase 7: completed.
- Phase 8: completed.
- Phase 9: completed.
- Phase 10: completed.
- Current quality gates: build, typecheck, lint, and focused unit/UI tests.

## Final Folder Structure

```text
apps/desktop/
  components.json
  package.json
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    app/
      App.tsx
      AppLayout.tsx
      AppProviders.tsx
      navigation.ts
    components/
      ui/
        accordion.tsx
        alert.tsx
        badge.tsx
        button.tsx
        card.tsx
        dialog.tsx
        dropdown-menu.tsx
        empty.tsx
        field.tsx
        input.tsx
        label.tsx
        progress.tsx
        scroll-area.tsx
        select.tsx
        separator.tsx
        sheet.tsx
        skeleton.tsx
        sonner.tsx
        spinner.tsx
        switch.tsx
        tabs.tsx
        textarea.tsx
        toggle-group.tsx
        tooltip.tsx
      app/
        AppHeader.tsx
        AppSidebar.tsx
        JsonPreview.tsx
        PageShell.tsx
        PermissionCallout.tsx
        SectionPanel.tsx
        StatusBadge.tsx
      icons/
        AppMark.tsx
      index.ts
    features/
      dictation/
        components/
          DeviceSelector.tsx
          DictationControls.tsx
          DictationDiagnostics.tsx
          FocusTargetSummary.tsx
          RecordingStatus.tsx
        hooks/
          useDictationSession.ts
        DictationPanel.tsx
        index.ts
      command-mode/
        index.ts
      onboarding/
        index.ts
      settings/
        index.ts
    hooks/
      useAudioDevices.ts
      useAudioRecorder.ts
    lib/
      errors.ts
      utils.ts
      tauri/
        focus.ts
        index.ts
        runtime.ts
    styles/
      globals.css
```

## Ownership Rules

- `components/ui`: shadcn primitives only. These should know nothing about BTC, dictation, hotkeys, Tauri, providers, or settings.
- `components/app`: reusable Vaak product components composed from shadcn primitives.
- `features/*/components`: components specific to one workflow.
- `features/*/hooks`: feature orchestration and state composition.
- `hooks`: reusable browser or platform hooks that are not tied to one feature.
- `lib/tauri`: the only UI-side boundary for Tauri commands and events.
- `styles/globals.css`: Tailwind import, shadcn theme variables, base styles, and rare global utilities only.

## Non-Negotiable UI Rules

- Use semantic colors such as `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`, and `ring-ring`.
- Do not use raw color utilities in feature code for styling, such as `bg-orange-500`, `text-blue-600`, or `border-zinc-200`.
- Use shadcn variants before custom styling.
- Use `gap-*`, not `space-x-*` or `space-y-*`.
- Use `size-*` when width and height are equal.
- Use `cn()` for conditional classes.
- Use full shadcn composition for components like `Card`, `Tabs`, `Dialog`, `Select`, and `DropdownMenu`.
- Use `Badge` for status, `Alert` for callouts, `Empty` for empty states, `Skeleton` or `Spinner` for loading states, and `sonner` for toast notifications.
- Do not put cards inside cards unless the inner card is a repeated item in a list.
- Keep radius compact: default `8px`, with smaller controls allowed.
- Keep Bitcoin amber as an accent, not the dominant background color.

## Phase 0: Baseline Cleanup

Purpose: make sure the current app is ready for the migration.

Tasks:

- Confirm `npm run build` passes before starting.
- Remove or ignore the legacy root `apps/desktop/src/App.tsx` if it is unused.
- Confirm `src/main.tsx` imports `src/app/App.tsx`.
- Keep current custom components in place until shadcn replacements are ready.
- `app.css` has been replaced by `globals.css`.

Acceptance criteria:

- Build passes.
- No behavior changes.
- Current UI still works in browser preview and Tauri shell.

## Phase 1: Tailwind Foundation

Purpose: install and configure Tailwind v4 without changing feature behavior.

Tasks:

- Install `tailwindcss` and `@tailwindcss/vite`.
- Update `vite.config.ts` to include the Tailwind Vite plugin.
- Create `src/styles/globals.css`.
- Add `@import "tailwindcss";`.
- Move only global base styles into `globals.css`.
- Add BTC minimal semantic CSS variables from `docs/UI_THEME_DECISION.md`.
- Replace `../styles/app.css` import with `../styles/globals.css`.

Acceptance criteria:

- `npm run build` passes.
- Tailwind utilities work.
- Current screen still renders.
- No shadcn components are required yet.

## Phase 2: shadcn Foundation

Purpose: initialize shadcn cleanly and create the reusable primitive layer.

Tasks:

- Add `@/* -> ./src/*` alias in `tsconfig.json`.
- Add the same alias in `vite.config.ts`.
- Add `src/lib/utils.ts` with `cn()`.
- Run `npx shadcn@latest init --template vite --preset nova --base radix`.
- Review generated `components.json`.
- Ensure shadcn points to:
  - `src/components/ui`
  - `src/lib/utils`
  - `src/styles/globals.css`
- Adjust generated theme variables to match the BTC minimal theme.

Acceptance criteria:

- `components.json` exists.
- shadcn info detects Tailwind and alias.
- `npm run build` passes.
- No duplicate `cn()` helpers remain long term.

## Phase 3: Install Core Primitives

Purpose: add only the primitives needed for near-term app screens.

Tasks:

- Add shadcn components:
  - `button`
  - `card`
  - `input`
  - `textarea`
  - `label`
  - `select`
  - `badge`
  - `alert`
  - `separator`
  - `tooltip`
  - `tabs`
  - `switch`
  - `skeleton`
  - `spinner`
  - `sonner`
  - `field`
  - `empty`
- Read generated files after install.
- Confirm imports use `@/`.
- Confirm component APIs match shadcn v4 docs.
- Do not add large layout/navigation components until the app shell is ready.

Acceptance criteria:

- Every installed component builds.
- No generated component has incorrect imports.
- No app feature imports a component that has not been installed.

## Phase 4: App-Level Components

Purpose: create reusable Vaak components on top of shadcn primitives.

Tasks:

- Create `components/app/PageShell.tsx`.
- Create `components/app/SectionPanel.tsx` using full `Card` composition.
- Create `components/app/StatusBadge.tsx` using `Badge`.
- Create `components/app/JsonPreview.tsx`.
- Create `components/app/PermissionCallout.tsx` using `Alert`.
- Create `components/app/AppHeader.tsx` if needed for the first shell pass.
- Add `components/index.ts` exports for app components only if it improves imports.

Rules:

- These components may encode Vaak product layout and tone.
- They must not know about a specific feature workflow.
- They should accept typed props and avoid passing giant objects.

Acceptance criteria:

- Existing custom `Panel`, `Button`, `Field`, `Alert`, `StatusPill`, and `JsonPreview` usages have a clear replacement path.
- App-level components use semantic tokens only.
- `npm run build` passes.

## Phase 5: Replace Existing UI Primitives

Purpose: move current screens from custom CSS components to shadcn-based components.

Tasks:

- Replace custom `Button` usage with shadcn `Button`.
- Replace custom `Panel` usage with `SectionPanel`.
- Replace custom `Field` usage with shadcn `Field`/`FieldGroup`.
- Replace custom `Alert` usage with shadcn `Alert`.
- Replace `.input` classes with shadcn `Input`, `Textarea`, and `Select`.
- Replace `StatusPill` with `StatusBadge`.
- Replace `app.css` component classes with Tailwind utilities and semantic tokens.
- Remove old local primitive files only after all imports are gone.

Acceptance criteria:

- No usage remains of `.button`, `.panel`, `.field`, `.input`, `.alert`, or `.status-pill`.
- Old local primitive files are deleted only when unused.
- `npm run build` passes after each replacement batch.

## Phase 6: Dictation Feature Decomposition

Purpose: make the current largest feature readable and reusable.

Tasks:

- Split `DictationPanel.tsx` into:
  - `DictationControls`
  - `DeviceSelector`
  - `RecordingStatus`
  - `FocusTargetSummary`
  - `DictationDiagnostics`
- Move feature-level orchestration into `useDictationSession` only if it reduces complexity.
- Keep `useAudioDevices` and `useAudioRecorder` in shared `hooks` unless they become dictation-only.
- Keep browser/Tauri interaction boundaries unchanged.

Acceptance criteria:

- `DictationPanel.tsx` becomes a composition component.
- Feature components have small, explicit props.
- Status labels and duration formatting are not duplicated.
- `npm run build` passes.

## Phase 7: App Shell And Navigation

Purpose: prepare for sophisticated screens without turning the first screen into a landing page.

Tasks:

- Create `AppLayout`.
- Add app sections:
  - Dictation
  - Command Mode
  - Settings
  - Diagnostics
- Use `Tabs` first if routing is not needed yet.
- Add `AppHeader` and optional compact sidebar only when the number of sections justifies it.
- Keep the primary screen usable immediately.

Acceptance criteria:

- Users land directly in the working app, not marketing content.
- Navigation is compact and keyboard accessible.
- Future feature screens have a clear place to live.

## Phase 8: Interaction States

Purpose: make the app feel production-level in everyday use.

Tasks:

- Add loading states with `Spinner` or `Skeleton`.
- Add empty states with `Empty`.
- Add toasts with `sonner`.
- Add tooltips for icon-only actions.
- Add disabled-state explanations where needed.
- Add permission callouts for microphone, accessibility, and Tauri-only features.

Acceptance criteria:

- Every async action has loading and error feedback.
- Every icon-only button has an accessible label and tooltip.
- Permission problems are actionable.
- Error text is normalized through `lib/errors.ts`.

## Phase 9: Theming Hardening

Purpose: make future theme changes cheap.

Tasks:

- Audit feature code for raw visual colors.
- Replace raw colors with semantic tokens.
- Keep only approved theme variables in `globals.css`.
- Add a small theme checklist to the docs.
- Add optional dark variables only after the light theme is stable.

Acceptance criteria:

- Theme changes are mostly limited to `globals.css`.
- Components do not hardcode BTC amber except through semantic tokens.
- No feature file owns its own color system.

## Phase 10: Quality Gates

Purpose: protect the UI system as the app grows.

Tasks:

- Add ESLint.
- Add Vitest + React Testing Library.
- Add focused tests for formatting, state rendering, and key components.
- Add Playwright smoke tests for core screens.
- Add build/typecheck/lint/test scripts.
- Add CI later when repository hosting is ready.

Acceptance criteria:

- `npm run build` remains required.
- Component behavior has focused tests.
- Main app screens can be smoke tested.
- New components follow the same primitives and theme rules.

## Implementation Sequence

Follow this order:

1. Phase 0: Baseline Cleanup
2. Phase 1: Tailwind Foundation
3. Phase 2: shadcn Foundation
4. Phase 3: Install Core Primitives
5. Phase 4: App-Level Components
6. Phase 5: Replace Existing UI Primitives
7. Phase 6: Dictation Feature Decomposition
8. Phase 7: App Shell And Navigation
9. Phase 8: Interaction States
10. Phase 9: Theming Hardening
11. Phase 10: Quality Gates

Do not start a later phase if the current phase does not build.

## Per-Phase Working Rule

Each phase should end with:

- `npm run build`
- A short summary of changed files
- A check against that phase's acceptance criteria
- A decision whether any cleanup should happen before the next phase

## When To Use `packages/ui-kit`

Do not use `packages/ui-kit` during the initial migration.

Move components there only when at least one of these becomes true:

- A second app needs the same UI components.
- The desktop app has a stable set of primitives that should be versioned separately.
- We need isolated Storybook or package-level tests for shared UI.

Until then, keeping UI inside `apps/desktop/src/components` is simpler and safer.

## First Implementation Task

Start with Phase 0 and Phase 1 together only if the baseline build is clean.

The first code-change batch should:

- Install Tailwind v4 dependencies.
- Add Tailwind Vite plugin.
- Create `globals.css`.
- Add the BTC minimal theme variables.
- Keep the existing app rendering.
- Verify with `npm run build`.
