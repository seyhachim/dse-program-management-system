# Deploying DSE-PMS

DSE-PMS production deployments use Supabase Auth. Development JWT authentication is for local development and automated tests only.

The current production shape is:

```text
Supabase PostgreSQL/Auth → Bun backend API → Vercel frontend
```

No Docker deployment is required by this guide.

## 1. Production authentication policy

Production must fail closed:

- Backend: `NODE_ENV=production` requires `AUTH_MODE=supabase`.
- Backend: `SUPABASE_JWKS_URL` must be present and use HTTPS.
- Frontend: production builds require `NEXT_PUBLIC_AUTH_MODE=supabase`.
- Frontend: production builds require Supabase URL + anon key.
- Frontend: `NEXT_PUBLIC_DEV_TOKEN` must not be configured in production.

Never deploy the shared development bearer-token path.

## 2. Supabase project

Create or select the Supabase project used by DSE-PMS.

Required production values:

```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
```

Enable the authentication providers used by the programme. DSE-PMS currently expects email-based user identities and resolves application roles/permissions from its own PostgreSQL tables rather than trusting Supabase role metadata.

## 3. Database migrations

Apply production migrations before starting the new backend version:

```bash
bun install --frozen-lockfile
bun run --cwd apps/backend db:generate
bun run --cwd apps/backend db:migrate:deploy
```

Do not use `prisma migrate dev` against production.

## 4. Backend production environment

Configure the Bun backend host with:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
AUTH_MODE=supabase
SUPABASE_JWKS_URL=https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
SUPABASE_INVITE_REDIRECT_URL=https://<frontend-domain>/auth/callback
CORS_ORIGIN=https://<frontend-domain>
PORT=<provided-by-host-or-4000>
```

Do not configure production authentication around `JWT_SECRET`. `JWT_SECRET` and locally generated DSE-PMS JWTs are development/test tooling only.

Start the backend directly with Bun:

```bash
bun run --cwd apps/backend start
```

The server validates authentication configuration before it begins listening. An unsafe or incomplete production auth configuration must terminate startup rather than silently falling back to development authentication.

## 5. Frontend production environment

Configure the Vercel production environment with:

```env
NEXT_PUBLIC_API_URL=https://<backend-domain>
NEXT_PUBLIC_AUTH_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public-anon-key>
```

Do **not** define:

```env
NEXT_PUBLIC_DEV_TOKEN
```

The production Next.js build deliberately fails if a development token is present or if the auth mode is missing/not `supabase`.

## 6. Supabase redirect configuration

In Supabase Authentication URL Configuration:

- Set the production Site URL to the deployed frontend origin.
- Allow `https://<frontend-domain>/auth/callback` as a redirect URL.
- Add `http://localhost:3000/auth/callback` only when local Supabase-auth testing is required.

`SUPABASE_INVITE_REDIRECT_URL` on the backend should match the deployed callback route.

## 7. First production account

Provision the first administrator through the controlled Supabase/admin setup process and make sure the matching DSE-PMS `User` row has the intended role assignment.

A successful Supabase login alone does not grant application access. The backend resolves the authenticated identity to a provisioned DSE-PMS user and returns `403` for unprovisioned identities.

## 8. Retiring legacy development credentials

If a deployed environment ever used `NEXT_PUBLIC_DEV_TOKEN` or production development JWTs, perform all of the following when moving to Supabase Auth:

1. Remove `NEXT_PUBLIC_DEV_TOKEN` from Vercel Production and Preview environments.
2. Redeploy the frontend so current browser assets no longer contain the old token.
3. Remove any production dependency on `JWT_SECRET` for authentication.
4. Rotate the old `JWT_SECRET` if it was ever used by a deployed backend or shared outside a local machine.
5. Remove copied development bearer tokens from deployment notes, screenshots, CI variables, and host configuration.
6. Confirm the backend starts only with `AUTH_MODE=supabase` under `NODE_ENV=production`.
7. Confirm an old development token receives `401` from the production backend.

Because production no longer accepts development JWT authentication, previously copied development tokens must become unusable even if somebody retained one.

## 9. Production verification

Before considering a deployment complete, verify:

```text
Backend production + AUTH_MODE missing       → startup fails
Backend production + AUTH_MODE=dev           → startup fails
Backend production + missing JWKS            → startup fails
Backend production + valid Supabase config   → startup succeeds

Frontend production + auth mode missing      → build fails
Frontend production + auth mode=dev          → build fails
Frontend production + DEV_TOKEN present      → build fails
Frontend production + Supabase config        → build succeeds
```

Then verify application behavior:

- `/health` returns healthy after safe startup.
- Login uses Supabase Auth.
- An authenticated provisioned user can load `/api/auth/me`.
- An unprovisioned Supabase identity is denied.
- Account invitation links resolve to the production `/auth/callback` route.
- CORS accepts only the intended frontend origin.

## 10. Local development

Local development may explicitly use development JWT authentication:

Backend:

```env
NODE_ENV=development
AUTH_MODE=dev
JWT_SECRET=<local-development-secret>
```

Frontend:

```env
NEXT_PUBLIC_AUTH_MODE=dev
NEXT_PUBLIC_DEV_TOKEN=<token-generated-locally>
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Generate a local token with:

```bash
bun run gen-token --role admin
```

These values must not be copied into production deployment configuration.
