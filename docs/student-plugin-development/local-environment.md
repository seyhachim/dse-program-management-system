# Isolated local test environment for student plugins (#1303)

> **Local-only developer workflow.** It does not provision or authorize any hosted staging environment, and it must not point to the PMS or Life Dashboard production databases. Use a disposable local PostgreSQL instance and fictional records. See [ADR #1301](https://github.com/seyhachim/dse-program-management-system/issues/1301) and [#1304 review controls](https://github.com/seyhachim/dse-program-management-system/issues/1304).

## Before starting

- Install Bun **1.2.23**, Git and PostgreSQL locally (Windows users may use Ubuntu/WSL or their own localhost PostgreSQL). No Docker or paid service is required.
- Create a **new, empty, locally owned** database named `dse_pms_student_plugins`, with a **local-only** login and password. Do not use a database dump, shared programme database, external tunnel or port-forward to hosted PostgreSQL.
- The wrapper in `apps/backend/scripts/student-plugin-local.ts` rejects non-loopback hosts, unapproved database names, production/staging auth settings and hosted-service configuration. **A loopback hostname alone cannot prove a server is truly local**; the student and mentor must verify the process owning that port.
- Only test identities and data from the repository's **development seed** may be used. Do not import real student names, contact details, grades, attendance, QA evidence or auth users.

## Shell environment (example, Bash/WSL)

Use a **new terminal**. Choose your own local password; values below are placeholders and must never be committed.

```bash
export DSE_STUDENT_PLUGIN_LOCAL=true
export NODE_ENV=development
export AUTH_MODE=dev
export DATABASE_URL='postgresql://plugin_dev:REPLACE_LOCAL_PASSWORD@127.0.0.1:5432/dse_pms_student_plugins?schema=public'
export JWT_SECRET='REPLACE_WITH_A_RANDOM_LOCAL_ONLY_SIGNING_SECRET'
export PORT=4000
export CORS_ORIGIN=http://localhost:3000
export TELEGRAM_PMS_ENABLED=false
export TELEGRAM_PUBLIC_ENABLED=false
```

Do **not** set `SUPABASE_*`, `NEON_AUTH_*`, `DSE_STAGING_DB_*`, or production/preview secrets in this terminal. Never paste actual connection URLs into PRs, logs or screenshots.

For Windows PowerShell, set the same values using `$env:DSE_STUDENT_PLUGIN_LOCAL="true"` (and `$env:KEY="value"` for each other variable). Using WSL/bash is also supported.

## Safe initial setup

From the repository root:

```bash
bun install --frozen-lockfile

# Guard runs immediately before each operation with the same environment:
bun apps/backend/scripts/student-plugin-local.ts migrate
bun apps/backend/scripts/student-plugin-local.ts seed
bun apps/backend/scripts/student-plugin-local.ts verify

# Tests for the target guard itself:
bun test apps/backend/scripts/student-plugin-local.test.ts
```

The wrapper is intentionally limited to `migrate`, `seed`, and `verify`. It invokes the repository's existing commands **only after** local validation succeeds, and does not print database credentials. **Do not bypass it** by running Prisma migrations against arbitrary `DATABASE_URL` values.

The existing seed provides fictional roles such as `admin@dse.dev`, `lecturer@dse.dev`, `student@dse.dev`, plus sample course and student records. It is **not** a live-data import. This first slice does not yet create event-specific fixtures; those belong to #1305 after the reference plugin exists.

## Run local PMS

With the same local environment variables set:

```bash
bun run gen-token --role student
bun run dev
```

Configure `apps/frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:4000`, `NEXT_PUBLIC_AUTH_MODE=dev`, and the freshly minted **local-only** `NEXT_PUBLIC_DEV_TOKEN` to exercise Student Portal behaviour. The dev token is deliberately accessible to the local browser: it is not a secret credential for any hosted/production environment, and must never be committed, deployed or shared.

Use a separate local role token to verify organiser/admin paths; create test users only using the synthetic seed and local role assignments. Test that student A cannot access student B's records, scoped programme A cannot access B, and unpublished official data remain protected.

**Note:** The current default seed does not by itself provide an exhaustive two-programme event-plugin test matrix. Existing auth unit tests include programme A/B denial; #1305 and the pilot must add full plugin-specific integration fixtures and negative tests before #1303/#1307 can be declared fully complete.

## Data cleanup and repeatability

- The seed uses idempotent upserts; it is not intended to reset arbitrary existing databases. For a **fresh test reset**, destroy/recreate **only** the uniquely named, locally owned `dse_pms_student_plugins` database using your local PostgreSQL administration tool. Never provide a production or staging target to any reset mechanism.
- Re-run the guarded `migrate`, `seed`, and `verify` sequence after recreating the empty DB.
- Remove synthetic screenshots, downloaded reports and local token files after the pilot; never put token output or real emails into GitHub issues/PRs.
- Record tests using synthetic names and exact failure statuses, not academic payloads.

## Relationship to hosted staging

Existing hosted staging efforts [#1290](https://github.com/seyhachim/dse-program-management-system/issues/1290) and [#1295](https://github.com/seyhachim/dse-program-management-system/issues/1295) are **separate**. #1295 has unresolved staging sign-in/auth boundary work; do not reuse its production-facing frontend, hosted DB credentials or auth sessions for student development.

The local test environment is the Phase 1 default. A hosted pilot is prohibited until its independent database identity, authentication, isolation, CORS and credential boundary have been tested and explicitly approved. There is no need to provision new paid services for student plugins.

## Completion criteria still to verify

- [ ] Independent reviewer confirms the local PostgreSQL listener is not a tunnel or shared DB.
- [ ] Fresh checkout walkthrough succeeds on Windows/WSL and an isolated DB.
- [ ] CI passes the guard tests and the standard repository checks.
- [ ] Complete student-plugin reference fixtures and cross-student/programme integration tests pass after #1305.
- [ ] #1304's protected-main independent review gate is enforced before students are invited.

**This document and script are a proposal in a draft PR. They are not merged, deployed or verified against real credentials.**
