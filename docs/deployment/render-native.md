# Native Render backend deployment

The production API is the existing native Node/Bun Render service `dse-pms-native-prod-candidate` (`srv-daotvb142hec73863ic0`) in Singapore. It tracks `main`, uses manual deployments, and checks `/health`. The old Docker Blueprint was removed because it described a different service and must not be used to deploy this backend.

## Commands

From the repository root, the live service uses:

- Build: `bun install --frozen-lockfile && bun run db:generate && bunx prisma validate --schema apps/backend/prisma/schema.prisma`
- Start: `bun run --cwd apps/backend start`

The backend `start` script runs `prisma migrate deploy` through `db:migrate:deploy` **before** starting `src/server.ts`. It uses the existing server-side `DATABASE_URL`. A failed migration returns a nonzero status, so the API does not listen and the new revision cannot pass `/health`. Do not use `seed` in production.

The separate disposable/test backend may still prepend `bun run db:migrate:deploy` in its Render start setting. Repeating `migrate deploy` applies only pending committed migrations and is safe; remove that duplicate setting separately when the test service is next maintained.

## Release sequence

1. Review every committed migration for compatibility with the currently serving backend. CI runs fresh migration, seed, security, authorization, typecheck, lint, tests, and build against a disposable PostgreSQL service. CI also tests the backend start failure path and a repeated migration deploy.
2. Confirm the production database backup/recovery point and current Prisma migration status. Do not alter academic records or migration metadata manually.
3. Manually deploy the intended `main` commit to the native Render service. Keep auto deploy off.
4. In deploy logs, confirm migrations finish successfully before the backend listening message; then confirm the new deploy is live and `/health` succeeds. Check the affected authenticated flow and application logs.
5. Record the commit, migration names, deploy result, and any follow-up in the release issue.

If migration deploy fails, inspect its error and leave the previous healthy deploy serving. Do not mark the release successful or bypass migration startup to make the new code live. A service restart also reruns the migration guard; investigate connectivity or migration failure before retrying.

A Render code rollback does **not** reverse database migrations. Roll back application code only when it is compatible with the migrated schema; otherwise fix forward with a reviewed migration and test it on a disposable database first. Never use `migrate reset`, `db push`, or a production seed as a rollback.
