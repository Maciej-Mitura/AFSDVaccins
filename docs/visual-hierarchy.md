# Visual hierarchy (Phase 35G2)

Practical conventions for the Vue PWA (`packages/pwa`). Prefer Nuxt UI semantic tokens over ad-hoc colours.

## Hierarchy

| Level             | Component / pattern                    | Chrome                                       |
| ----------------- | -------------------------------------- | -------------------------------------------- |
| Application shell | `CommonAppShell`                       | Header bottom border + elevated surface only |
| Page header       | `CommonPageHeader`                     | No card/border/shadow; owns the page `h1`    |
| Section           | `CommonPageSection` (`default`)        | Spacing only                                 |
| Inset group       | `CommonPageSection` (`inset`)          | Muted surface (`bg-muted`), no border/shadow |
| Item / list row   | Dividers (`divide-y`) or light spacing | Prefer row dividers over boxed rows          |

Shell role titles are labels (not `h1`). Auth screens may keep a brand `h1` outside the app shell.

## Nested-card rule

At most **one** of section / content group / item may use a full bordered card on the same visual branch.

Never:

```text
card → card → bordered item
```

Prefer:

```text
page → borderless section → inset group → divided rows
```

## Tokens

- **Primary:** Nuxt UI semantic `primary` → Tailwind `teal` (teal-600 `#0d9488` matches PWA `theme_color`). Configure in `vite.config.ts` / `vitest.config.ts` via `ui({ ui: { colors: { primary: 'teal' } } })`.
- **Radius:** `--ui-radius: 0.375rem` in `src/assets/main.css`.
- **Surfaces / text / borders:** `bg-default`, `bg-muted`, `bg-elevated`, `text-highlighted`, `text-toned`, `text-muted`, `border-default`.
- **Status colours:** leave success / warning / error / info on Nuxt UI defaults.
- **Font:** Inter (`--font-sans`).
- **Dark mode:** keep using Nuxt UI `.dark` semantic variables; optimise light mode first.
- **Charts:** keep the existing teal series in `echarts-setup.ts` (compatible with primary teal).

Do not introduce a parallel hex colour system in templates.
