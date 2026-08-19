# DSE PMS theming contract

The application theme is intentionally split into three layers:

1. `apps/frontend/app/globals.css` owns brand values for light and dark themes.
2. `packages/config/theme.css` maps those CSS variables to Tailwind utilities.
3. `packages/ui` primitives and feature screens consume semantic utilities.

## Rule for application chrome

New application UI should prefer semantic utilities instead of Tailwind palette names.

Prefer:

- `bg-card`, `bg-surface-secondary`, `bg-surface-hover`
- `text-foreground`, `text-muted-foreground`
- `border-border`, `border-border-light`
- `bg-primary`, `text-primary`
- `bg-success-bg text-success`
- `bg-warning-bg text-warning`
- `bg-error-bg text-error`
- `bg-info-bg text-info`
- `bg-inactive-bg text-inactive`

Avoid application-workflow styling such as `bg-blue-50`, `text-emerald-700`, `border-amber-200`, or `bg-red-50`. Those colors make a screen depend on a specific palette and prevent a future theme from being changed centrally.

Palette-specific colors are still acceptable when color itself is data or part of an external/document specification, for example a chart series or an official exported document template.

## Statuses

Use `StatusBadge` with semantic tones for new workflow states:

```tsx
<StatusBadge tone="success" label="Approved" />
<StatusBadge tone="warning" label="Pending review" />
<StatusBadge tone="info" label="Draft" />
<StatusBadge tone="danger" label="Changes required" />
<StatusBadge tone="neutral" label="Superseded" />
```

Legacy `live`, `upcoming`, and `tournament` tones remain supported for existing callers but should not be used for new academic workflow states.

## Radius and spacing

The base radius comes from `--radius` in `globals.css`; shared Tailwind radius utilities are derived from it in `packages/config/theme.css`. Use the existing `rounded-sm/md/lg/xl` scale rather than hard-coded pixel radii.

Normal Tailwind spacing (`p-4`, `gap-4`, `space-y-6`) is allowed. Do not create a token for every spacing value. Prefer shared components when spacing must be consistent across many screens.

## Buttons and tables

Use the shared `Button` and `DataTable` components where they fit. Their hover, active, grouping, danger, and surface states are theme-driven. Feature screens should not recreate these states with local palette classes unless the interaction genuinely requires a different component.

## Changing the visual theme later

For a normal rebrand or visual refresh, start in `apps/frontend/app/globals.css`. Changes to primary color, canvas/card surfaces, sidebar, statuses, and the base radius should propagate through shared UI without requiring feature-screen rewrites.
