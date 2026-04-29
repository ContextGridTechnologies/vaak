# UI Theme Checklist

Use this checklist before merging UI changes.

## Required Rules

- Feature code uses semantic colors only: `bg-background`, `bg-card`, `bg-muted`, `bg-primary`, `text-foreground`, `text-muted-foreground`, `text-destructive`, `text-success`, `text-warning-foreground`, `border-border`, `ring-ring`.
- Feature code does not use raw palette utilities such as `bg-orange-*`, `text-blue-*`, `border-zinc-*`, or `bg-slate-*`.
- Raw color values such as `oklch(...)`, hex values, and `color-mix(...)` stay in `apps/desktop/src/styles/globals.css` or theme docs.
- Bitcoin amber is used through `primary`, `ring`, or `accent`, not direct orange/amber classes.
- App components use shadcn variants first, then semantic tokens, then layout classes.
- Status UI uses `StatusBadge`, `PermissionCallout`, `Badge`, or `Alert`; it does not create one-off colored spans.
- Empty/loading/feedback states use `EmptyState`, `Skeleton`, `Spinner`, or `sonner`.
- Spacing uses `gap-*`, not `space-x-*` or `space-y-*`.
- Equal width/height sizing uses `size-*`.
- Text in compact controls remains short enough for narrow desktop widths.

## Allowed Theme Files

- `apps/desktop/src/styles/globals.css`
- `docs/UI_THEME_DECISION.md`
- `docs/UI_THEME_CHECKLIST.md`

## Review Command

```powershell
rg "(bg|text|border|ring|from|to|via)-(red|orange|amber|yellow|green|emerald|blue|sky|slate|zinc|neutral|stone|gray|purple|violet|indigo|pink|rose)-|#[0-9a-fA-F]{3,8}|oklch\\(|color-mix\\(" apps/desktop/src docs
```

Expected result:

- Raw color values appear only in theme files.
- shadcn primitive internals may contain generic structural classes.
- App and feature code should not introduce product colors outside semantic tokens.
