<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md: orkstage-console

Guide for AI coding agents and the developers working with them. The block above is maintained by
Next.js (`next dev` rewrites it); keep it and edit only below.

## What this repository is

The OrkStage web console: Next.js 16 (App Router), React 19, Tailwind CSS 4, TanStack Query,
react-hook-form with zod, CASL. It talks only to the control API (`orkstage` repository); it never
holds cloud credentials or calls a provider.

## Layout

| Path | What lives there |
|---|---|
| `src/app/(console)/` | Signed in pages: `instances`, `deployments`, `templates` (builder), `cloud-targets`, `tenants`, `incidents`, `status`, `audit`, `settings/*` |
| `src/app/` (outside `(console)`) | Login and public routes |
| `src/components/ui/` | Design system primitives (Button, Field, Input, Select, Table, Badge, Dialog, Tabs, Notice). Use them; do not add new primitives casually |
| `src/components/` | Feature components (`builder/`, `instance/`, app shell, resource icons) |
| `src/lib/api.ts` | `apiGet` / `apiSend`: relative `/api/v1`, cookie session, CSRF header on mutations |
| `src/lib/ability.ts` | CASL in the browser (`useCan`, `useMe`, `isPlatformStaff`); the API stays authoritative |
| `src/lib/queries.ts` | Shared React Query hooks |
| `src/i18n/` | use-intl setup, formatting (`useFormat`), labels; locale from a cookie |
| `messages/en.json`, `messages/pt-BR.json` | Every user visible string, same keys in both files |
| `scripts/` | `check-i18n.mjs` (test), `extract-icons.mjs` (offline brand icons into `src/lib/cloud-icons.json`) |

The core packages `@orkstage/contracts`, `domain`, `authorization` and `templates` are linked from
the sibling `orkstage` checkout (see `orkstage-dev`). Request schemas and DTO types come from
`@orkstage/contracts`: never redefine an API shape here.

## Commands

From the `orkstage-dev` workspace root (the console is part of its pnpm workspace):

```bash
pnpm -C orkstage-console dev         # http://localhost:3000, proxies /api to API_INTERNAL_URL (default http://localhost:4000)
pnpm -C orkstage-console typecheck   # next typegen + tsc
pnpm -C orkstage-console test        # i18n check: key parity and writing rules in both languages
pnpm -C orkstage-console build
```

After changing a core package, build it first (`pnpm -C orkstage/packages/<name> build`).

## Conventions

- **Every string is translated.** Add keys to both `messages/en.json` and `messages/pt-BR.json`;
  `pnpm test` fails on missing keys and on dashes or hyphenated words in either language
  (in Portuguese, avoid enclitic forms such as "ativá-lo"; rephrase).
- **Data fetching:** React Query with stable keys (`['instance', id, 'triggers']`); invalidate the
  keys a mutation affects. Poll only while something is in progress (`refetchInterval` returning
  false otherwise).
- **Forms:** react-hook-form + zod; reuse the zod schema from contracts when there is one and
  validate the assembled request with it before sending (see `cloud-targets/page.tsx`).
- **Permissions:** hide or disable actions with `useCan()`, but never rely on it for security.
- **Provider specific UI is data driven:** target fields come from `PROVIDER_FORMS`, names from
  `PROVIDER_INFO`, enabled providers from `GET /cloud/providers`. Avoid `if (provider === ...)`.
- **Simulation is always labelled** (`SimulatedBadge`): users must never confuse simulated
  resources with real ones.
- **Icons:** lucide-react for UI; brand logos only through `ProviderLogo` and the offline icon set
  (add names to `scripts/extract-icons.mjs` and rerun it).
- **Accessibility:** labels on every input (`Field` + `htmlFor`), `aria-*` on custom controls,
  keyboard reachable actions, no information carried by color alone.
- Prose in both languages: plain, no em or en dashes, no " - " as punctuation, no emoji,
  sentence case.

## License headers

Every source file starts with an SPDX header, `AGPL-3.0-only`. Future `ee/` directories use
`LicenseRef-OrkStage-Enterprise`, and code outside them never imports from them. CI runs the check;
to add missing headers:

```bash
bash scripts/spdx.sh --fix
```

## Git workflow

Branch, pull request, squash merge when CI (`typecheck-build`) is green; then bump the pin in
`orkstage-dev`. If the change needs a new API field, merge the `orkstage` change first.
