# UI Theme Decision: Minimal BTC Business App

This document locks the UI foundation before component implementation starts.

Related docs:

- `docs/UI_THEME_CHECKLIST.md`

## Decision

Use Tailwind CSS v4 with shadcn/ui v4 Radix components.

- Tailwind: v4 with `@tailwindcss/vite`.
- shadcn/ui: Vite + TypeScript + Radix base.
- Import alias: `@/* -> ./src/*`.
- Component source location: `apps/desktop/src/components/ui`.
- App-specific composition components: `apps/desktop/src/components/app`.
- Icons: `lucide-react`.
- Styling rule: semantic tokens first, layout classes second, no raw color utilities in feature code.

This is the right fit for the app because Tailwind v4 gives us CSS-first theme variables, and shadcn gives us accessible primitives that we own as source. The product can stay minimal and fluid without inventing every interaction pattern from scratch.

## Product Feel

Vaak should feel like a quiet BTC business desktop application:

- Minimal, precise, and fast.
- Calm enough for repeated daily use.
- Financial-grade, not playful.
- Modern without looking like a crypto landing page.
- Mostly neutral, with Bitcoin amber used as a controlled action/accent color.

The UI should avoid:

- Loud gradients.
- Oversized hero layouts.
- Decorative cards inside cards.
- Purple/blue SaaS defaults.
- Heavy shadows and glass effects.
- Large rounded corners everywhere.
- Raw orange surfaces across the whole app.

## Theme Direction

Use a light-first neutral interface with optional dark mode later.

The base should be warm-neutral, but not beige-heavy. Bitcoin amber should be visible in primary actions, focus rings, selected states, and small brand accents. It should not dominate backgrounds.

Recommended semantic palette:

```css
:root {
  --background: oklch(0.985 0.004 95);
  --foreground: oklch(0.19 0.018 255);

  --card: oklch(1 0 0);
  --card-foreground: oklch(0.19 0.018 255);

  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.19 0.018 255);

  --primary: oklch(0.72 0.16 65);
  --primary-foreground: oklch(0.16 0.025 70);

  --secondary: oklch(0.955 0.006 255);
  --secondary-foreground: oklch(0.22 0.018 255);

  --muted: oklch(0.955 0.006 255);
  --muted-foreground: oklch(0.48 0.018 255);

  --accent: oklch(0.94 0.035 75);
  --accent-foreground: oklch(0.22 0.018 255);

  --destructive: oklch(0.58 0.2 25);
  --destructive-foreground: oklch(0.98 0.006 95);

  --border: oklch(0.9 0.008 255);
  --input: oklch(0.9 0.008 255);
  --ring: oklch(0.72 0.16 65);

  --success: oklch(0.58 0.12 155);
  --success-foreground: oklch(0.98 0.006 95);

  --warning: oklch(0.78 0.14 78);
  --warning-foreground: oklch(0.18 0.02 70);

  --radius: 0.5rem;
}
```

## BTC Color Rule

Bitcoin amber is the brand accent, not the theme.

Use amber for:

- Primary CTA.
- Active navigation state.
- Focus ring.
- Selected segmented controls.
- Small brand marks.
- Important positive business emphasis when appropriate.

Do not use amber for:

- Whole page backgrounds.
- Every icon.
- Every card border.
- Generic status states.
- Large gradients.

Status colors remain semantic: success, warning, destructive, muted, and primary.

## Typography

Use a clean professional sans stack first, then upgrade if we add a font dependency.

Initial production-safe choice:

```css
--font-sans: "Aptos", "Segoe UI", sans-serif;
--font-mono: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
```

Later option:

- Use `Geist` or `IBM Plex Sans` if we want a more controlled product identity.
- Keep numeric displays tabular using `tabular-nums`.

## Shape And Density

The product should be compact and operational:

- Default radius: `8px`.
- Inputs/buttons: `6px` to `8px`.
- Cards/panels: `8px`.
- Use border and spacing for hierarchy before shadows.
- Shadows should be subtle and rare.
- Prefer `gap-*` layouts.
- Avoid `space-x-*` and `space-y-*`.

## Motion

Motion should make the app feel fluid without becoming decorative.

Use:

- Fast opacity/translate transitions for panels and overlays.
- Button press/hover states from shadcn defaults.
- Skeletons for loading states.
- Toasts for completion/error feedback.

Avoid:

- Bouncy motion.
- Long page-load animations.
- Decorative animated backgrounds.
- Animation that delays task completion.

## shadcn Component Policy

Use shadcn primitives before custom markup:

- Buttons use `Button` variants.
- Panels use full `Card` composition.
- Status uses `Badge`.
- Callouts use `Alert`.
- Empty states use `Empty`.
- Loading states use `Skeleton` or `Spinner`.
- Forms use `FieldGroup` and `Field`.
- Option sets use `ToggleGroup`.
- Overlays use `Dialog`, `Sheet`, or `DropdownMenu`.
- Notifications use `sonner`.

Feature code should not override component colors with raw Tailwind classes. It should compose primitives and use semantic tokens.

## Tailwind Policy

Use Tailwind for layout, spacing, sizing, and responsive behavior.

Rules:

- Use semantic colors: `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-primary`.
- Use `cn()` for conditional classes.
- Use complete class names only.
- Use `size-*` when width and height match.
- Use `truncate` for single-line truncation.
- Use mobile-first responsive classes.
- Keep custom CSS limited to theme variables, base styles, and rare utilities.

## Implementation Decision

Proceed with:

```bash
npm install tailwindcss @tailwindcss/vite clsx tailwind-merge class-variance-authority lucide-react
npx shadcn@latest init --template vite --preset nova --base radix
```

Then adjust the generated theme variables to the BTC minimal palette above before adding application components.

Do not add feature components until:

- Tailwind builds successfully.
- `components.json` exists.
- `globals.css` owns the semantic tokens.
- shadcn primitives are installed and reviewed.
- The current screen still builds after the foundation migration.
