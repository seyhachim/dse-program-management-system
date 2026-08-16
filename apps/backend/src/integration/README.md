# Backend integration tests

These tests exercise the real Express router/middleware/service/Prisma boundary against an isolated PostgreSQL database. They are intentionally separate from the fast default test suite because they require migrations, seed data, and a reachable database.

## Local setup — no Docker required

Use a disposable local PostgreSQL database or a disposable Supabase/PostgreSQL database. Do not point the integration suite at production data.

From the repository root, set a dedicated `DATABASE_URL`, then apply migrations and seed the database.

### Windows PowerShell

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/dse_integration?schema=public"
$env:AUTH_MODE="dev"
$env:JWT_SECRET="local-integration-secret-at-least-32-characters"
$env:BACKEND_INTEGRATION_TESTS="1"

bun run db:migrate:deploy
bun run seed
bun run test:backend:integration
```

### macOS/Linux

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/dse_integration?schema=public"
export AUTH_MODE=dev
export JWT_SECRET="local-integration-secret-at-least-32-characters"
export BACKEND_INTEGRATION_TESTS=1

bun run db:migrate:deploy
bun run seed
bun run test:backend:integration
```

The integration file is skipped during ordinary `bun run test` / `bun run test:backend` unless `BACKEND_INTEGRATION_TESTS=1` is set, so the normal quality job does not silently depend on PostgreSQL.

## Current authorization scenarios

`auth-authorization.integration.test.ts` covers:

- missing, invalid, and expired tokens → 401;
- cryptographically valid Supabase identity without a provisioned PMS account → 403;
- lecturer ownership boundaries across courses/course specs;
- primary and co-lecturer access to an assigned offering;
- submitted/approved CourseSpec write locks;
- student mutation denial;
- QA reviewer permitted QA read + academic edit denial;
- programme-secretary coordinator-only mutation denial;
- programme-coordinator programme-wide course access.

The Supabase scenario uses an ephemeral localhost JWKS server and a test RSA keypair. It does not call a live Supabase project and does not require production secrets.

## CI

GitHub Actions job **Backend integration authorization** provisions a clean PostgreSQL database, applies the complete migration history, runs the normal seed, and then executes:

```bash
BACKEND_INTEGRATION_TESTS=1 bun run test:backend:integration
```

A failure in authentication, authorization, ownership, workflow locking, migration/seed setup, or the real route/service/database boundary fails the job.
