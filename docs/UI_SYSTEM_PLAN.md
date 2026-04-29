# UI System Plan: Tailwind + shadcn/ui

This plan defines how the desktop UI should evolve from the current local component layer into a production-level design system for sophisticated app screens.

Related docs:

- `docs/UI_THEME_DECISION.md`
- `docs/UI_THEME_CHECKLIST.md`
- `docs/UI_QUALITY_GATES.md`
- `docs/UI_IMPLEMENTATION_ROADMAP.md`

## Current Assessment

The desktop UI now has the intended foundation:

- `apps/desktop/src/components/ui/` contains shadcn-owned primitives.
- `apps/desktop/src/components/app/` contains Vaak-specific reusable components.
- `apps/desktop/src/features/` owns workflow-specific UI composition.
- `apps/desktop/src/styles/globals.css` centralizes Tailwind imports, shadcn theme variables, and BTC semantic tokens.

The next structural risk is feature complexity, not primitive availability. `DictationPanel` should be split into smaller feature components before more sophisticated UI is added.

## Target Direction

Use Tailwind CSS as the styling foundation and shadcn/ui as the primitive component source.

Important constraint: shadcn/ui is not a component library dependency in the usual sense. It copies source components into the repo. That is good for a desktop app because we can own and adapt the components, but it means we need a clear local structure and review discipline.

The theme decision is locked in `docs/UI_THEME_DECISION.md`: Tailwind v4, shadcn/ui v4 Radix, light-first minimal BTC business theme, semantic tokens, and Bitcoin amber used as a controlled accent rather than a dominant palette.

## Recommended Structure

```text
apps/desktop/src/
  app/
    App.tsx
    AppLayout.tsx
    routes.tsx                  # later, when routing is added
  components/
    ui/                         # shadcn-owned primitives
      button.tsx
      card.tsx
      dialog.tsx
      input.tsx
      label.tsx
      select.tsx
      textarea.tsx
      tooltip.tsx
    app/                        # product-specific reusable components
      PageShell.tsx
      SectionPanel.tsx
      StatusBadge.tsx
      JsonPreview.tsx
      EmptyState.tsx
      PermissionCallout.tsx
    icons/
      AppIcon.tsx               # only app-specific icons; use lucide otherwise
  features/
    dictation/
      DictationPanel.tsx
      DictationControls.tsx
      DeviceSelector.tsx
      FocusTargetSummary.tsx
      useDictationSession.ts
    settings/
    onboarding/
    command-mode/
  hooks/
  lib/
    tauri/
    utils.ts                    # cn() helper
  styles/
    globals.css                 # Tailwind layers + CSS variables only
```

Long-term, move only stable, cross-app primitives into `packages/ui-kit`. Do not move everything there now. The desktop app is still the only real consumer, so premature package extraction would add friction without solving a current problem.

## Component Ownership Rules

- `components/ui/*`: low-level shadcn primitives. Keep them generic, accessible, and close to upstream shadcn patterns.
- `components/app/*`: Vaak-specific reusable components composed from shadcn primitives.
- `features/*`: workflow-specific components, state, hooks, and screen composition.
- `lib/tauri/*`: the only UI-side access point for Tauri commands/events.
- `styles/globals.css`: Tailwind base layers, theme CSS variables, and minimal global styling.

Avoid putting feature behavior into `components/ui`. If a component knows about dictation, microphones, focused fields, hotkeys, providers, or permissions, it belongs in `features` or `components/app`.

## Tailwind Setup

Install and configure:

- `tailwindcss`
- `@tailwindcss/vite` if using Tailwind v4, or `postcss` + `autoprefixer` if using Tailwind v3
- `tailwind-merge`
- `clsx`
- `class-variance-authority`
- `lucide-react`
- `tailwindcss-animate` if using Tailwind v3 shadcn defaults

Add:

- `apps/desktop/components.json`
- `apps/desktop/src/styles/globals.css`
- `apps/desktop/src/lib/utils.ts` with `cn()`
- path alias `@/* -> ./src/*` in `tsconfig.json` and `vite.config.ts`

Use CSS variables for theme tokens so shadcn components and custom app components share the same contract.

## shadcn/ui Baseline Components

Start with this minimal set:

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
- `dialog`
- `dropdown-menu`
- `tabs`
- `switch`
- `slider`
- `sonner`

These cover the expected product surface for onboarding, settings, permissions, dictation controls, command mode, provider configuration, and diagnostics.

## Visual System

The app should feel like a focused desktop productivity tool, not a marketing page. Recommended direction:

- Dense, readable panels with clear hierarchy.
- 8px or lower radius for most controls and cards.
- Neutral surfaces with restrained accent color.
- Strong focus states and keyboard-visible interaction.
- Lucide icons for toolbar actions and command buttons.
- Avoid large decorative hero sections in the app shell.
- Avoid one-color themes; use neutral base, one primary accent, and semantic state colors.

The current warm visual direction is okay for a spike, but production should be more operational and information-dense.

## Migration Plan

### Phase 1: Foundation

- Install Tailwind and shadcn dependencies.
- Add `globals.css`, Tailwind config or Tailwind v4 Vite plugin, and `components.json`.
- Add `@/*` path alias.
- Add `cn()` utility using `clsx` and `tailwind-merge`.
- Replace `app.css` import with `globals.css`.
- Keep the current UI visually functional while introducing Tailwind.

Acceptance criteria:

- `npm run build` passes.
- Existing desktop screen renders without visual breakage.
- No feature behavior changes.

### Phase 2: Primitive Replacement

- Generate shadcn components into `apps/desktop/src/components/ui`.
- Replace current custom `Button`, `Field`, `Alert`, and basic input classes with shadcn primitives.
- Convert `Panel` into `SectionPanel` under `components/app`, built on top of shadcn `Card`.
- Convert `StatusPill` into an app-level `StatusBadge` built on top of shadcn `Badge`.
- Convert `JsonPreview` into an app-level component with Tailwind classes.

Acceptance criteria:

- Current `App.tsx` and `DictationPanel.tsx` use shadcn-based components.
- No raw `.button`, `.panel`, `.field`, `.input`, or `.alert` classes remain.
- Component props are typed and narrow.

### Phase 3: Feature Decomposition

- Split `DictationPanel` into smaller feature components:
  - `DictationControls`
  - `DeviceSelector`
  - `RecordingStatus`
  - `FocusTargetSummary`
  - `DictationDiagnostics`
- Move orchestration state into `useDictationSession` only if it reduces component complexity.
- Keep device and recorder hooks separate because they already model external browser APIs cleanly.

Acceptance criteria:

- `DictationPanel` becomes a readable composition component.
- Feature components have clear props and no duplicated status formatting.
- Hook boundaries remain testable.

### Phase 4: Production UX Layer

- Add app shell navigation for Dictation, Command Mode, Settings, and Diagnostics.
- Add consistent empty, loading, error, disabled, and permission states.
- Add dialogs for destructive or permission-sensitive actions.
- Add toasts for transient outcomes.
- Add tooltips for icon-only controls.
- Add keyboard navigation expectations for all interactive surfaces.

Acceptance criteria:

- Every async action has loading and error states.
- Every icon-only action has an accessible label and tooltip.
- Every disabled action has an understandable surrounding state.

### Phase 5: Quality Gates

- Add ESLint if not already present.
- Add Vitest + React Testing Library for UI logic and component behavior.
- Add Playwright smoke tests for the main desktop web view.
- Add Storybook only after there are enough stable components to justify it.
- Add CI checks for typecheck, build, lint, and tests.

Acceptance criteria:

- Pull requests cannot merge without typecheck and build.
- Core UI states are covered by focused tests.
- Screenshots can be captured for desktop and narrow viewports.

## Implementation Order

1. Add Tailwind + shadcn foundation.
2. Replace low-level primitives.
3. Convert existing app components to Tailwind.
4. Split `DictationPanel`.
5. Add app navigation and settings-ready shell.
6. Add tests and CI gates.
7. Extract to `packages/ui-kit` only when a second consumer exists or when the desktop app has enough stable components to justify package boundaries.

## Decisions

- Use Tailwind CSS v4 with `@tailwindcss/vite`.
- Use shadcn/ui v4 Radix components.
- Initialize shadcn with `nova` and `--base radix`, then adjust semantic tokens to the BTC minimal theme.
- Use shadcn components inside `apps/desktop/src/components/ui` first.
- Keep product-specific components in `apps/desktop/src/components/app`.
- Do not use `packages/ui-kit` yet.
- Use lucide-react for icons.
- Prefer Tailwind classes and variants over custom global component CSS.
- Keep global CSS limited to Tailwind layers, theme variables, base body styles, and platform-specific resets.

## Immediate Next Step

The next implementation task should be Phase 1: install Tailwind/shadcn dependencies, add the config files, add path aliases, and keep the current screen working. After that, replace primitives incrementally so the app stays buildable after each step.
