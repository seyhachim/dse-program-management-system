# DSE Program Management System

DSE-PMS is a web-based programme and course management system for the Data Science and Engineering programme. It brings programme structure, courses, offerings, lecturers, students, course specifications, teaching and learning plans, assessment design, rubrics, and academic review workflows into one system.

The codebase is a **Bun + Turborepo monorepo** with a **Next.js frontend**, **Express API**, **Prisma/PostgreSQL database**, shared types, and a plugin-based backend architecture.

## Current capabilities

The backend currently registers domain plugins for:

- Authentication and role/permission management
- Programme management
- Students
- Lecturers
- Courses and course specifications
- Course offerings and lecturer assignments
- Teaching and learning strategies
- Teaching methods
- Assessments and rubrics
- Course-spec review and approval workflows
- Enrollment-scoped student portal with courses, schedules, approved learning
  information, assessments, published results, CLO achievement, announcements,
  anonymous feedback, and downloadable approved course documents

Course-spec data includes normalized structures for CLOs, assessments, CLO alignment, weekly planning, review status, and related teaching/learning information.

## Tech stack

| Area | Technology |
| --- | --- |
| Monorepo | Bun workspaces + Turborepo |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Backend | Express, TypeScript, Bun |
| Database | PostgreSQL + Prisma |
| Authentication | Local/test Dev JWT; Supabase Auth for production |
| Validation/contracts | Zod + `@dse-pms/shared-types` |
| Shared UI | `@dse-pms/ui` |
| Production frontend | Vercel |
| Production database | Supabase PostgreSQL |

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
├── AGENTS.md                  # Canonical verification and agent workflow
├── DEPLOY.md                  # Deployment and Supabase Auth guide
├── package.json               # Root workspace commands
└── turbo.json                 # Turborepo task configuration
```

### Backend plugin architecture

Domain modules live under:

```text
apps/backend/src/plugins/<plugin-id>/
```

Plugins are registered in `apps/backend/src/core/app.ts`. The core application mounts each plugin at:

```text
/api/<plugin-id>
```

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

DSE-PMS runs directly with Bun; Docker is not part of the current development workflow. Configure `DATABASE_URL` to point at the PostgreSQL database you want to use.

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

For Prisma/database changes, also verify the intended upgrade path and a fresh database. CI applies all migrations to PostgreSQL from zero, seeds it, runs curriculum database checks, and verifies the database security posture.

## Course specification import

The backend contains a course-spec import utility for loading canonical course specification data into the database.

```bash
bun run --cwd apps/backend course-spec:import <path>
```

Example options used by the importer include course filtering, replacement of existing data, commit mode, and JSON reporting. Check `apps/backend/scripts/course-spec-import.ts` before performing a production import.

## Authentication and authorization

DSE-PMS has two authentication modes with different allowed environments:

1. **Development JWT** — local development and automated tests only.
2. **Supabase Auth** — required for production/deployed environments.

Both backend and frontend require an explicit auth mode. Production fails closed instead of defaulting to development authentication.

Application authorization is owned by DSE-PMS. Roles and permissions are stored in PostgreSQL and enforced by the backend rather than relying only on authentication-provider metadata.

Typical roles include administrator, lecturer, and student, with permissions assigned through the normalized role/permission model.

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

Before opening or merging a PR, run the canonical verification commands above. If a change modifies Prisma models, also verify migrations against both the intended existing database path and a fresh database where appropriate.

Before creating or updating a PR, read the root [`pull_request_template.md`](./pull_request_template.md). Before merge, compare the finished PR against both that template and the issue acceptance criteria.

## Adding or changing a backend plugin

A plugin normally consists of its router, service, manifest/index, schemas/types, and any database support it requires.

When introducing a new domain plugin:

1. Add or update its shared contract in `packages/shared-types` when needed.
2. Create the plugin under `apps/backend/src/plugins/<id>/`.
3. Register it in `apps/backend/src/core/app.ts`.
4. Add the corresponding frontend workflow under `apps/frontend/app/`.
5. Add Prisma models/migrations where persistence is required.
6. Add tests for important service, permission, and validation behavior.

Cross-domain behavior should use explicit services/contracts rather than tightly coupling unrelated UI or database code.

## Deployment

The current deployment architecture uses:

```text
Supabase PostgreSQL/Auth → Bun backend API → Vercel frontend
```

See [`DEPLOY.md`](./DEPLOY.md) for environment variables, database migration steps, Supabase Auth configuration, invite redirects, credential retirement, and deployment verification.

Production database migrations should use:

```bash
bun run db:migrate:deploy
```

Do not run `prisma migrate dev` against the production database.

## Security notes

- Never commit `.env`, `.env.local`, database passwords, JWT secrets, Supabase service-role keys, or access tokens.
- `SUPABASE_SERVICE_ROLE_KEY` belongs on the backend only.
- `NEXT_PUBLIC_*` variables are exposed to the browser and must not contain private secrets.
- `NEXT_PUBLIC_DEV_TOKEN` is forbidden in production frontend builds.
- Development JWT authentication is forbidden when the backend runs with `NODE_ENV=production`.
- PMS application tables and protected custom schemas are backend-only; run `bun run --cwd apps/backend db:security:verify` after database-security changes.

## Documentation

- [`AGENTS.md`](./AGENTS.md) — canonical repository verification and agent workflow
- [`DEPLOY.md`](./DEPLOY.md) — production deployment and Supabase Auth setup
- [`CLAUDE.md`](./CLAUDE.md) — repository-specific development guidance and architecture notes
- [`docs/database-security.md`](./docs/database-security.md) — backend-only database access model and verifier

## Project status

DSE-PMS is under active development. The initial Students-only vertical slice has grown into a broader programme-management platform, so implementation details and workflows continue to evolve as new GitHub issues are completed.
