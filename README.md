# DSE Program Management System

DSE-PMS is a web-based programme management platform for the Data Science and Engineering programme. It centralizes programme governance, curriculum, courses and offerings, lecturer/student workflows, course specifications, academic calendars, student-facing services, AUN-QA quality-assurance work, handbook publishing, and Telegram access while preserving clear ownership of academic records and audit history.

The codebase is a **Bun + Turborepo monorepo** with a **Next.js frontend**, **Express API**, **Prisma/PostgreSQL database**, shared Zod/TypeScript contracts, and a plugin-based backend architecture.

## Current capabilities

The current `main` branch includes these major product areas:

### Programme and curriculum management

- Programme profile, curriculum versions, curriculum placement, PLOs, competencies, and programme-level configuration.
- Curriculum-aware course placement by study year and semester.
- Canonical Academic Calendar with academic years, semester periods, examinations, breaks, events, publication lifecycle, source provenance, and revision history.
- Course Offering creation linked to published Academic Calendar periods instead of duplicating canonical semester dates.
- Safe preservation of historical Offering/calendar context.

### Courses, Course Specifications, and teaching design

- Course management and Offering/lecturer assignment.
- Structured Course Specifications with CLOs, PLO alignment, teaching and learning strategies, weekly plans, assessments, rubrics, resources, and review workflow.
- Course Specification submission/review/approval history and document preview/export support.
- Teaching methods, teaching-learning strategies, assessment templates, and rubric management.
- Canonical JSON Course Specification import with dry-run/commit safeguards.

### Students and Student Portal

- Student records, enrolments, cohorts/progression, and programme-scoped access controls.
- Student Portal with enrolled courses, schedules, approved course learning information, assessments/deadlines, rubrics, published results, CLO achievement, announcements, anonymous feedback, and approved document downloads.
- Student Academic Calendar view and dashboard summary resolved from the student's published academic context.
- Published-only and enrolment-scoped data boundaries to prevent draft or cross-student leakage.

### Student Handbook

- Versioned Student Handbook workspace using reusable PMS source-data blocks rather than copied programme records.
- Read-only source projections for approved programme information.
- Handbook review/publishing workflow with immutable published source snapshots.
- Document preview and export support.

### AUN-QA quality assurance and SAR

- AUN-QA programme-level criteria/requirements, assignments, evidence, mappings, provenance, analysis, and review workflows.
- Evidence-gap analysis with deterministic and optional AI-assisted support while preserving human QA judgment.
- QA evidence review, expert corrections, controlled research/pilot datasets, findings, and improvement actions.
- SAR requirement writing, evidence-grounded context, review/approval, release history, and official SAR export foundations.
- Programme-scoped QA roles and authorization; QA/SAR work does not rewrite curriculum, results, Course Specifications, or other authoritative academic records.

### Telegram

- Authenticated Telegram Mini App for high-frequency student/lecturer workflows such as schedules, class context, announcements, deadlines, attendance history, results/CLO achievement, surveys, lecturer workload, and authorized class-delivery actions.
- Secure Telegram identity linking/revocation with verified init data and backend authorization.
- Public DSE Telegram bot backed by PMS-owned published programme information, FAQs, curriculum projection, Ask DSE search, privacy-preserving question analytics, and rate limiting.
- Telegram remains a thin access channel; the PMS backend/database stays the source of truth.

### Security, auditability, and academic integrity

- Explicit application RBAC and programme-scoped authorization.
- Supabase Auth for deployed environments; local development JWT mode is fail-closed outside development/test use.
- Protected PostgreSQL schemas, RLS/Data API hardening, database-security verification, and fresh-migration CI checks.
- Immutable/auditable handling for approved/submitted Course Specifications, published calendars, finalized results, QA evidence/reviews, and released SAR/handbook records where applicable.
- Cross-plugin integration through registry/service contracts rather than direct plugin implementation imports.

## Tech stack

| Area | Technology |
| --- | --- |
| Monorepo | Bun workspaces + Turborepo |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Express, TypeScript, Bun |
| Database | PostgreSQL + Prisma |
| Authentication | Local/test Dev JWT; Supabase Auth for deployed environments |
| Validation/contracts | Zod + `@dse-pms/shared-types` |
| Shared UI | `@dse-pms/ui` |
| Production frontend | Vercel |
| Production database/auth | Supabase PostgreSQL + Supabase Auth |

## Repository structure

```text
.
├── apps/
│   ├── backend/               # Express API, Prisma, migrations, seeders, plugins
│   └── frontend/              # Next.js App Router application
├── packages/
│   ├── config/                # Shared TypeScript/configuration
│   ├── shared-types/          # Shared schemas, types and plugin contracts
│   └── ui/                    # Shared UI components
├── docs/                      # Security, QA, Telegram and implementation documentation
├── AGENTS.md                  # Canonical verification and agent workflow
├── DEPLOY.md                  # Deployment and Supabase Auth guide
├── pull_request_template.md   # Required PR inspection/implementation workflow
├── package.json               # Root workspace commands
└── turbo.json                 # Turborepo task configuration
```

### Backend plugin architecture

Domain modules live under:

```text
apps/backend/src/plugins/<plugin-id>/
```

Current plugins include programme, students, lecturers, courses, offerings, teaching-learning, methods, assessments/rubrics, Student Portal, Student Handbook, QA, Telegram, authentication, and related supporting domains.

Plugins are registered in `apps/backend/src/core/app.ts`. The core application mounts plugin routers through the central application/registry architecture.

The live plugin manifests are available from:

```text
GET /api/registry
```

The backend health endpoint is:

```text
GET /health
```

## Prerequisites

Install:

- [Bun](https://bun.sh/) `1.2.23`
- PostgreSQL access — local PostgreSQL or a hosted PostgreSQL database such as Supabase
- Git

DSE-PMS runs directly with Bun; **Docker is not part of the current development workflow**. Configure `DATABASE_URL` to point at the PostgreSQL database you want to use.

## Local setup

### 1. Install dependencies

From a fresh checkout:

```bash
bun install --frozen-lockfile
```

The root `postinstall` automatically generates Prisma Client. A successful install therefore prepares the generated client needed by typecheck and build; no undocumented manual generation step is required.

### 2. Configure the backend environment

Create `apps/backend/.env` and provide at least:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public"
AUTH_MODE=dev
JWT_SECRET="replace-with-a-development-secret"
PORT=4000
CORS_ORIGIN="http://localhost:3000"
```

`AUTH_MODE` is required. `dev` authentication is only for local development and tests; a production backend refuses to start unless `AUTH_MODE=supabase` is configured.

### 3. Apply database migrations

From the repository root:

```bash
bun run db:migrate
```

For production-style migration deployment:

```bash
bun run db:migrate:deploy
```

Prisma Client generation is automatic during install, but it can also be rerun explicitly after schema work:

```bash
bun run db:generate
```

### 4. Seed development data

```bash
bun run seed
```

The seed creates the programme data, roles/permissions, users, and development records required by the current application.

### 5. Configure the frontend

Create `apps/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL="http://localhost:4000"
NEXT_PUBLIC_AUTH_MODE=dev
```

#### Local dev-token auth

Generate a development token:

```bash
bun run gen-token --role admin
```

To preview the seeded student portal instead, generate a student token:

```bash
bun run gen-token --role student
```

Then add it to `apps/frontend/.env.local`:

```env
NEXT_PUBLIC_DEV_TOKEN="<generated-token>"
```

`NEXT_PUBLIC_DEV_TOKEN` is local/test-only. Never configure it in a production or preview frontend environment.

#### Supabase Auth

Deployed environments use Supabase Auth. Configure the backend and frontend Supabase environment variables described in [`DEPLOY.md`](./DEPLOY.md).

### 6. Start development

From the repository root:

```bash
bun run dev
```

Default local services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- Backend health check: `http://localhost:4000/health`

## Root commands

Run these from the repository root unless otherwise noted.

```bash
bun run dev          # Start workspace development servers
bun run build        # Build all workspaces
bun run typecheck    # Type-check all workspaces
bun run lint         # Run the real ESLint gate for lint-enabled workspaces
bun run test         # Run the complete Bun test suite
bun run test:backend # Explicitly discover and run backend tests
bun run db:migrate   # Run Prisma development migrations
bun run db:generate  # Generate Prisma Client explicitly
bun run seed         # Seed the backend database
bun run gen-token    # Generate a local development JWT
```

Backend-specific commands:

```bash
bun run --cwd apps/backend test
bun run --cwd apps/backend typecheck
bun run --cwd apps/backend db:migrate:deploy
bun run --cwd apps/backend db:generate
bun run --cwd apps/backend db:security:verify
```

Frontend-specific commands:

```bash
bun run --cwd apps/frontend dev
bun run --cwd apps/frontend typecheck
bun run --cwd apps/frontend lint
bun run --cwd apps/frontend build
```

## Canonical verification

For a fresh checkout, start with:

```bash
bun install --frozen-lockfile
```

Then run the repository definition of done:

```bash
bunx prisma validate --schema apps/backend/prisma/schema.prisma
bun run typecheck
bun run lint
bun run test
bun run test:backend
bun run build
```

These commands are CI gates. They must return non-zero for real failures. The explicit backend command prevents backend test discovery from silently becoming empty.

A production frontend build requires the Supabase public environment variables described in `DEPLOY.md`; CI supplies non-secret placeholder values so the fail-closed production configuration is exercised without using real credentials.

For Prisma/database changes, also verify the intended upgrade path and a fresh database. CI applies all migrations to PostgreSQL from zero, seeds it, runs domain integrity checks, and verifies the database security posture.

## Data import utilities

### Course Specification import

The backend contains a Course Specification importer for canonical JSON data:

```bash
bun run --cwd apps/backend course-spec:import <path>
```

The importer is dry-run oriented and supports explicit commit/replacement/reporting controls. Inspect `apps/backend/scripts/course-spec-import.ts` and its README before production use; do not overwrite approved/official Course Specifications casually.

Other domain-specific import/migration utilities may exist under `apps/backend/scripts/`. Treat dry-run/report output and human review as part of any academic-data migration workflow.

## Authentication and authorization

DSE-PMS has two authentication modes with different allowed environments:

1. **Development JWT** — local development and automated tests only.
2. **Supabase Auth** — required for deployed/production environments.

Both backend and frontend require an explicit auth mode. Production fails closed instead of defaulting to development authentication.

Application authorization is owned by DSE-PMS. Roles and permissions are stored in PostgreSQL and enforced by backend service/router boundaries rather than relying only on authentication-provider metadata.

Typical roles include Admin, Programme Coordinator, Lecturer, Student, and QA-specific contributor/reviewer responsibilities where configured. Object-level and programme-level authorization must remain server-authoritative.

## Development workflow

For feature work:

```text
GitHub Issue
    ↓
feature/fix branch
    ↓
implementation + migration when needed
    ↓
typecheck / lint / tests / build
    ↓
Pull Request
    ↓
review + merge
```

Before opening or merging a PR, run the canonical verification commands above. If a change modifies Prisma models or protected database schemas, also verify migrations against both the intended existing database path and a fresh database, plus the database-security verifier.

Before creating or updating a PR, read the root [`pull_request_template.md`](./pull_request_template.md). Before merge, compare the finished PR against both that template and the issue acceptance criteria.

## Adding or changing a backend plugin

A plugin normally consists of its router, service, manifest/index, schemas/types, and any database support it requires.

When introducing a new domain plugin:

1. Add or update its shared contract in `packages/shared-types` when needed.
2. Create the plugin under `apps/backend/src/plugins/<id>/`.
3. Register it in `apps/backend/src/core/app.ts`.
4. Add the corresponding frontend workflow under `apps/frontend/app/`.
5. Add Prisma models/migrations or protected-schema SQL where persistence is required.
6. Add tests for important service, permission, integrity, and validation behavior.

Cross-domain behavior should use explicit services/contracts and the plugin registry rather than tightly coupling unrelated UI or database implementation code.

## Deployment

The current deployment architecture is:

```text
Supabase PostgreSQL/Auth → Bun backend API → Vercel frontend
```

See [`DEPLOY.md`](./DEPLOY.md) for environment variables, database migration steps, Supabase Auth configuration, invite redirects, credential retirement, and deployment verification.

Production database migrations should use:

```bash
bun run db:migrate:deploy
```

Do not run `prisma migrate dev` against the production database.

Current deployment policy keeps production deployment controlled/manual; PR branches may use Vercel Preview deployments for browser smoke verification when preview capacity is available.

## Security notes

- Never commit `.env`, `.env.local`, database passwords, JWT secrets, Supabase service-role keys, Telegram bot/webhook secrets, or access tokens.
- `SUPABASE_SERVICE_ROLE_KEY` belongs on the backend only.
- `NEXT_PUBLIC_*` variables are exposed to the browser and must not contain private secrets.
- `NEXT_PUBLIC_DEV_TOKEN` is forbidden in production frontend builds.
- Development JWT authentication is forbidden when the backend runs with `NODE_ENV=production`.
- PMS application tables and protected custom schemas are backend-only unless explicitly designed otherwise; run `bun run --cwd apps/backend db:security:verify` after database-security changes.
- Published/approved/finalized academic and QA records must be changed only through their explicit revision/correction workflows.

## Documentation

- [`AGENTS.md`](./AGENTS.md) — canonical repository verification and agent workflow
- [`DEPLOY.md`](./DEPLOY.md) — deployment and Supabase Auth setup
- [`CLAUDE.md`](./CLAUDE.md) — repository-specific development guidance and architecture notes
- [`docs/database-security.md`](./docs/database-security.md) — backend-only database access model and verifier
- `docs/` — additional QA, Telegram, privacy, deployment, and feature-specific documentation

## Project status

DSE-PMS is under active development, but it is no longer an initial Students-only prototype. The current platform already covers programme/curriculum governance, Course Specifications and teaching design, Academic Calendar and Course Offering integration, Student Portal, Student Handbook, AUN-QA evidence/SAR workflows, and Telegram channels.

Open GitHub issues and draft PRs track the remaining feature expansion and release-smoke work. Treat `main` plus merged migrations/contracts as the source of truth for what is currently implemented; do not assume an open draft PR is already part of the deployed product.
