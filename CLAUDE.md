# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DSE Program Management System — a modular monolith with a plugin registry, currently
implementing the RUPP course-specification syllabus (Part 1 programme reference +
Part 2 §1–25 course spec wizard) plus Students/Courses/Offerings/Lecturers CRUD.
Auth runs in one of two swappable modes behind `AUTH_MODE` — a local JWT dev-token
scheme for local/CI work, or real Supabase Auth — isolated in `core/auth/*` so plugin
code never depends on which is active.

## Commands

```bash
bun install                            # install all workspaces
bun run db:up                          # start Postgres via Docker (docker-compose.yml)
bun run --cwd apps/backend db:migrate  # apply Prisma migrations (dev)
bun run seed                           # seed dev users + sample data
bun run gen-token --role admin         # AUTH_MODE=dev only: mint a dev JWT (roles: admin | lecturer | student)

bun run dev                            # turbo: backend :4000 + frontend :3000 together
bun run build                          # turbo: build all workspaces
bun run lint                           # turbo: lint all workspaces (frontend only defines one, via next lint)
bun run typecheck                      # turbo: tsc --noEmit in every workspace
```

Testing: only `packages/shared-types` currently has tests (`bun:test`, files named
`*.test.ts`, colocated with the source they test — see `course-spec.test.ts`).
Run all of them with `bun test` from the repo root, or scope to one file with
`bun test src/course-spec.test.ts` from inside `packages/shared-types`.
`apps/backend` has a `test` script (`bun test`) wired for when it gains tests, but has none yet.

Deploy target/process (Supabase → Render → Vercel, and switching from dev-token to
Supabase Auth via `AUTH_MODE`) is documented in `DEPLOY.md`.

## Architecture

### Monorepo

Bun workspaces (`apps/*`, `packages/*`) + Turborepo. `packages/shared-types` is the
single source of truth for the plugin contract, permission strings, and every Zod
schema — both `apps/backend` and `apps/frontend` import it, so frontend/backend
payloads cannot drift. `packages/config` holds the shared `tsconfig.base.json` and
`theme.css` (the Tailwind v4 `@theme inline` mapping shared design tokens like
`--color-primary` onto utility classes); `packages/ui` holds shared React
primitives (DataTable, StatusBadge, TableToolbar, `@base-ui/react`-based inputs)
generated via the shadcn CLI (`bun run --cwd packages/ui ui:add <component>`,
style `base-luma` — see `packages/ui/components.json`). Actual brand colour
*values* (Noviq navy) live as CSS variables in `apps/frontend/app/globals.css`
(`:root` for light, `.dark` for dark — toggled by `next-themes`), not in
`packages/config`, so theming doesn't require touching the shared package.

### Plugin registry (backend)

Each domain (`students`, `courses`, `offerings`, `lecturers`, `methods`, `rubrics`,
`auth`) lives under `apps/backend/src/plugins/<id>/` as `index.ts` (exports a `BackendPlugin` — the
shared `DSEPlugin` contract plus an Express router + service) + `router.ts` +
`service.ts`. `core/app.ts` is the only place
plugins are registered (`registry.register(...)`) and is deliberately domain-agnostic:
it just mounts every registered router at `/api/{id}` and serves `/api/registry` for
introspection. The frontend sidebar nav (`app/(shell)/sidebar.tsx` via
`navFromManifests`) is generated from that same manifest list, so a new plugin's nav
entry appears automatically once its manifest is added to `pluginManifests` in
`packages/shared-types/src/plugins.ts`. A manifest with no `routes` (like `auth`) is
registered and permission-gated but gets no sidebar entry — its actions are embedded
in another page's UI (auth's account-creation lives in the Lecturers page).

**Cross-plugin calls always go through `registry.get('<id>').service`** — never a
direct import between `plugins/*` directories. This is the in-process equivalent of
an API call and is what lets a plugin be added or removed without touching others
(see the "Adding a plugin later" section in `README.md`).

### Auth & permissions

`core/auth/token.ts` is the single swap-point. `getAuthMode()` reads `AUTH_MODE`
(default `dev`) and the two schemes coexist:

- **`dev`** — local HS256 tokens minted by `signToken` / `bun run gen-token` and
  verified whole by `verifyToken`. The token carries a `roles: Role[]` claim (issue
  #77 phase B); `verifyToken` also still accepts the legacy single-`role` claim
  shape signed before that phase, since a token minted under the old shape can
  still be in the wild (7-day expiry) when the new code deploys. Local dev and CI
  run in this mode with no live Supabase project.
- **`supabase`** — real Supabase-issued JWTs, verified against the project JWKS
  (`SUPABASE_JWKS_URL`) in `verifySupabaseToken`, which returns **identity only**
  (auth uid + email). The token is **never trusted for role**.

`core/auth/middleware.ts` (`requireAuth`) is the only place a raw token is read; it
sets `req.user: AuthUser` (`{ id, email, roles: Role[] }` — a caller can hold more
than one role) and every downstream check depends only on that shape. In `supabase`
mode `resolveSupabaseUser` looks the caller up in our own `User` table (by `authId`,
falling back to `email` and backfilling `authId` on first login — the `user_auth_id`
migration added that column), and **`UserRoleAssignment` is the sole role/authorization
source of truth** — `User` has no `role`/`roleId` column at all (dropped in issue #77
phase C) — so Supabase metadata can never escalate a role. A valid Supabase login with
no provisioned `User` row is a 403 (`UnprovisionedAccountError`).

`core/permissions/index.ts` builds an in-memory cache from the DB (`Role` →
`RolePermission` → `Permission`, loaded once and never invalidated since nothing
mutates those tables at runtime yet) and exposes `requirePermission(...)`, the guard
factory plugins use — this cache, not a hardcoded map, is the one auditable place
deciding which roles hold a permission (`ROLE_PERMISSIONS_LEGACY` in the same file is
dead code, kept only as a rollback reference for issue #67's cutover). `roleHasPermission`
takes the caller's full `roles` array and grants access if *any* role has the
permission (a union, not an intersection). Every plugin router calls `requireAuth`
then `requirePermission(...)` per route (`"<id>:read"|"<id>:write"`, plus the
admin-only `"accounts:create"`). `requirePermission` only checks that coarse
permission string; row-level ownership is a separate check layered on top in the
plugins that need it — e.g. `courses/router.ts`'s `ensureCourseAccess` and the
`ownerScope` passed into `courseService.list`/`listSpecProgress` (mirrored in
`offerings/router.ts`, both now checking `req.user!.roles.includes("admin")`) let
admins see/act on every course or offering while a lecturer only sees courses they
were actually offered — assigned as an `Offering`'s primary lecturer
(`Offering.lecturerId`) *or* an assigned `OfferingCoLecturer` (issue #79) — either
grants both read and write. `Course.lecturerId` is just the course record's on-file
default lecturer and does not by itself grant visibility; lecturer/co-lecturer
assignment only happens on the Offering form (issue #71), never on the Course form —
`Offering.lecturerId` is a separate per-term assignment from `Course.lecturerId` and
isn't affected by it.

The normalized `Role`/`Permission`/`RolePermission` schema (`schema.prisma`, issue
#65) is seeded by `prisma/seed.ts`. Issue #77 migrated `User`↔`Role` from a 1:1 FK to
many-to-many in expand/contract phases mirroring #65-#67: phase A added an additive
`UserRoleAssignment` join table (named to avoid colliding with the legacy `UserRole`
enum), backfilled from `User.roleId` and kept in sync by every path that
creates/reassigns a role (`auth.createAccount`, `lecturers.create`, `prisma/seed.ts`).
Phase B cut enforcement over to it — `AuthUser`/`GET /api/auth/me` (`MeResponse`) carry
`roles: Role[]`, and the frontend nav/ownership checks (`routeAllowsRole`, `navForRole`,
`navGroupsForRole` in `packages/shared-types`) take a `Role[]` and match on any one of
them. Phase C (landed) dropped `User.role`/`roleId`/the `UserRole` enum outright —
`lecturers/service.ts`'s `list`/`getById`/`update`/`remove` (previously filtering on
`role: "lecturer"`) now filter on `roleAssignments: { some: { role: { slug: "lecturer" } } }`
instead, since that column-based filter would otherwise have broken on the drop.
`GET /api/auth/me` still returns a single `role` field (now just `roles[0]`, the
primary/first role) alongside `roles`, purely so a frontend bundle deployed before
`roles` existed doesn't break during the Render/Vercel deploy-skew window — drop it
once that's no longer a concern.

**Account provisioning** is the `auth` plugin. `GET /api/auth/me` returns the resolved
caller; `POST /api/auth/accounts` (admin-only, `accounts:create`) creates a lecturer
login via the Supabase **Admin API** (`inviteUserByEmail`, using the server-only
`SUPABASE_SERVICE_ROLE_KEY` — never shipped to the browser) and links it to an app
`User` row. There is no self-signup.

On the frontend, `lib/api.ts` is the single place the bearer token is attached:
`lib/supabase.ts` exposes `AUTH_MODE` (from `NEXT_PUBLIC_AUTH_MODE`) and a lazily-built
browser client, so `dev` mode uses the static `NEXT_PUBLIC_DEV_TOKEN` and `supabase`
mode uses the live session access token. Login UI is `app/login/page.tsx`, the
authenticated shell is gated by `app/(shell)/auth-guard.tsx`, and `lib/auth.ts` wraps
the `auth` plugin calls (`me`, `createAccount`).

### Course Specification wizard

This is the largest and most active domain, defined entirely in
`packages/shared-types/src/course-spec.ts`:

- `SPEC_SECTIONS` is the ordered registry driving the wizard stepper (`id`, `title`,
  syllabus `ref` like `"§16"`, `part`, and `state: "ready" | "soon"` for
  not-yet-implemented sections). Storage is one `CourseSpec` row per course
  (`prisma/schema.prisma`), with `data[sectionId]` holding that section's opaque JSON
  and `status[sectionId]` tracking `draft`/`complete` so a lecturer can save one
  section and resume later.
- `SPEC_SECTION_SCHEMAS` maps a `SpecSectionId` to its Zod schema. The backend route
  `PUT /api/courses/:id/spec/:sectionId` (`plugins/courses/router.ts`) looks up the
  schema for the given section id and 400s if the section isn't implemented yet —
  this is the only validation gate for section saves, so adding a new section means
  adding its schema here and to `SPEC_SECTION_SCHEMAS`.
- Sections reference each other by stable code, not id: CLOs (§14) are `CLO1`,
  `CLO2`… by position; the §18 Weekly Plan's `cloCodes` point back to a §14 CLO. §14
  originally split PLO mapping from a separate §15 "CLO → PLO Mapping & Methods" tab
  (SLT hours, teaching/assessment methods); those were merged into one per-CLO form —
  the CLO create/edit page (`clos/clo-form-fields.tsx`) now also captures SLT hours,
  teaching methods, and assessment methods, and §15 no longer exists as a tab. SLT
  hours entered per CLO must sum to the course-level total SLT (reconciliation banner
  in `clos-section.tsx`); Focus % / F-M-P are derived from each CLO's share of that
  total (`cloFocusPercent`/`cloFocusCode` in `course-spec.ts`, wrapped for form string
  input by `focusPercentOf`/`focusCodeOf` in `clo-model.ts`) — not stored. Course specs
  saved before this merge carry their SLT hours/teaching methods in a dead `cloMapping`
  JSON blob; `toClosForm` folds that into the CLO on load if the CLO doesn't already
  have its own values, so nothing is lost, and the field is dropped for good next time
  §14 is saved. The **Weekly Plan** (§18, tab labelled "Weekly Plan", stored under the
  `slt` section key) is a week-by-week outline: one row per week with a topic, linked
  CLOs, learning activities, Contact Hours (L+T), Self-Study Hours, and
  Assessment/Deliverables. Weekly SLT is derived (`weekSlt` = Contact + Self-Study) and
  the footer totals each column. It **replaced** the old §16 mode/activity SLT grid, so
  the detailed physical/online/independent × L/T/P/O breakdown no longer exists; the
  Weekly Plan and §14's SLT/methods fields are independent. Frontend lives in
  `weekly-plan-section.tsx` + `add-week-dialog.tsx` + `weekly-plan-model.ts`.
- Reference constants (`PLOS`, `COGNITIVE_LEVELS`/`AFFECTIVE_LEVELS`/`PSYCHOMOTOR_LEVELS`,
  `FOCUS_LEVELS`, `LEARNING_ACTIVITIES`, `LETTER_GRADES`) back the dropdowns/inline guides
  and are fixed programme data, not user-editable — except `LEARNING_ACTIVITIES`, which
  is a starting vocabulary for the Weekly Plan's activity picker that lecturers can
  extend with their own entries.
- The **CLO Alignment Mapping** section (`mapping` key, tab labelled "Mapping") is a
  cross-reference view, not a numbered RUPP section: a matrix of §14 CLOs against §18
  Weekly Plan weeks and §17 assessments, each cell storing an editable alignment
  **strength** (0 None / 1 Low / 2 Medium / 3 High). Storage is sparse — only rated
  cells live in `data.mapping.cells` (absent = *unrated*, distinct from an explicit
  None); cells referencing a deleted week/assessment/CLO are reconciled away on load
  and save. Every headline figure (overall %, per-CLO and per-column averages, the
  distribution donut) is derived from these cells by pure helpers in
  `course-spec.ts` (`mappingOverallPercent`, `cloAlignmentAverages`, …). Frontend lives
  in `mapping-section.tsx` + `mapping-model.ts`.
- `TeachingMethod`/`AssessmentMethod` (the `methods` plugin) are global vocabularies
  shared across all courses — an add of an existing name reuses the row rather than
  duplicating it.

### Rubric Library

`Rubric.levels`/`Rubric.criteria` (the rating-scale columns and criterion rows of a
rubric grid), validated by the shared Zod schema in
`packages/shared-types/src/rubrics.ts` at the API boundary — the API contract is
unchanged throughout. Issue #80 is normalizing this out of the original jsonb
columns into `RubricLevel`/`RubricCriterion`/`RubricCell` tables via the same
expand/contract pattern as issue #77: phase A added the tables and made
`rubricService.create`/`update`/`prisma/seed.ts` dual-write them
(`syncNormalizedRubricTables` in `plugins/rubrics/service.ts`); phase B (landed)
cut `rubricService.list`/`getById`/`create`/`update` over to reading the
normalized tables (`toRubric` reassembles `levels`/`criteria` from
`levelRows`/`criterionRows`/their `cells`, ordered by each row's `order` column) —
`Rubric.levels`/`criteria` are still written on every create/update (rollback
safety) but nothing reads them anymore. The jsonb columns drop in phase C.
`RubricCriterion`'s id is preserved from the jsonb criterion's own client-generated
`id` (`crypto.randomUUID()`, what the edit form keys rows on) rather than
synthesized — but that id is only unique *within* a rubric (the seeded sample
rubrics reuse short ids like `"c1"` across different rubrics), so its primary key
is the `(rubricId, id)` pair, not `id` alone; `RubricCell` carries `rubricId`
alongside `criterionId`/`levelId` to satisfy that composite FK. Writes to the
normalized tables are always a full delete-and-rebuild per rubric, not a diff — a
real single-cell targeted write (the actual fix for issue #80's stated concurrent-
edit problem) is a still-later improvement this schema only makes possible.

### Frontend

Next.js App Router. `app/(shell)/` is the authenticated shell (sidebar + topbar);
each plugin gets a route segment there. The course spec wizard lives under
`app/(shell)/courses/[id]/spec/`, one `*-section.tsx` file per wizard section plus
`spec-client.tsx` orchestrating the stepper. `lib/*.ts` (one file per plugin, e.g.
`students.ts`, `course-spec.ts`) wraps `lib/api.ts` with typed calls built on the
shared Zod schemas — this is the layer to extend when a plugin gains new endpoints.

Runs on **Next.js 16 / React 19** with Turbopack (`next.config.mjs` pins the
monorepo `root` so an unrelated parent-dir lockfile can't confuse it). Consequently
route `params`/`searchParams` are **async** — a page/layout must be `async` and
`await params` before reading it (see `courses/[id]/spec/page.tsx`); the old
synchronous `{ params }: { params: { id } }` shape no longer works.
