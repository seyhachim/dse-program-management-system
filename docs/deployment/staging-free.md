# DSE PMS — No-additional-cost persistent staging

**Status 2026-11-07: ISOLATED NEON DATABASE PROVISIONED AND MARKED; DEPLOYED STAGING NOT VERIFIED.**
Neon organization `org-winter-truth-95707920` is confirmed Free
(subscription `free_v3`, documented $0/month). Independent project
`dse-pms-staging` (`wandering-heart-46069342`) is in Singapore
(`aws-ap-southeast-1`); default branch `br-misty-bar-a19mu0bw`,
database `neondb` is empty (zero user tables), and Neon Auth is disabled.
The read-only query verified `current_database() = neondb` and the marker
`DSE-PMS-STAGING:20261107-neon-verified-01` after marking that **new Neon
database only**. The direct hostname is
`ep-purple-scene-a1py5uzt.ap-southeast-1.aws.neon.tech` (not a secret).
No Prisma migration, seed, Render deploy, production DB or academic data
change has been performed. The existing Render preview backend database
target and isolated authentication remain unverified, so this is **not yet
a full persistent staging environment**. Feature #1285 and safety PR #1291
remain draft; security audit gate #1292 is outstanding.

## Provider assessment

| Provider | Verified | Decision |
| --- | --- | --- |
| Supabase Free | Two ACTIVE projects: DSE PMS and Life Dashboard; legacy auth-test project INACTIVE. The free plan permits two active projects across owned/admin organisations. | Do not restore the paused test project, upgrade, pause production, or share a live database/schema. |
| Render Free web | My Workspace has a native production candidate, an older PR #1144 native backend and a legacy Docker service; automated preview deployment is OFF. | Reuse the older native backend only after its current database and environment are audited. Never touch legacy Docker or production backend. |
| Render Free Postgres | No existing DB; new Free databases expire in 30 days and lack backups. | Not persistent; do not provision for this use. |
| DigitalOcean | Existing $4/month, 512 MB Ubuntu droplet with unverified original workload. | Do not modify. |
| Neon Free PostgreSQL | Verified organisation Free, project in Singapore, independent fresh empty DB and staging identity marker; 1 GB/project storage cap, 100 CU-hours/project and 5 GB transfer per project on Free. | Database provisioned and marked; migration/Render/auth smoke remain pending. |
| GitHub Actions | Separate disposable PostgreSQL test databases and Playwright suite already in CI. | Keep running until persistent staging is established. |

Official billing references:
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://render.com/docs/free
- https://neon.com/pricing

Provider Free tiers may be suspended on usage limits, and Render bandwidth
can produce overage charges. Before enabling staging traffic, confirm the
actual account plan, current usage and available spending cap. Stop if a
nonzero incremental charge cannot be ruled out.

## Never do these

- Copy or import production students, attendance, academic, QA, SAR or Life
  Dashboard records into staging; change live Supabase Auth accounts or keys.
- Migrate, seed or access the real Supabase DSE PMS or Life Dashboard databases
  using staging scripts. A distinct schema in a production database is NOT
  sufficient isolation.
- Turn on Render's old Docker service, add a paid project, or configure
  paid autoscaling. Do not change the native production service.
- Place database passwords, JWT secrets, Supabase service-role keys or bearer
  tokens in GitHub issues, commits, logs, public Vercel environment variables,
  screenshots, or code.
- Publish a development JWT authentication mode on a public server.

## Phase A: Isolated durable database

1. Connect Neon to ChatGPT or open the user's own Neon account. Read the
   subscription plan and current resource limits. Create only an independent
   **Free** project named for DSE PMS staging after confirming $0 new cost,
   no paid autoscale add-ons, and no impact on the two active Supabase projects.
2. On the newly verified Neon project, provision a fresh database. Do NOT
   import anything from production. Record project ID, endpoint hostname,
   database name and region privately. Never publish database credentials.
3. Using the Neon SQL editor for that newly created database only, set a
   unique identity marker. Replace the example with a randomly generated ID:

   ~~~sql
   COMMENT ON DATABASE neondb
     IS 'DSE-PMS-STAGING:replace-with-unique-24char-id';
   ~~~

   This is a staging-only PostgreSQL database-level comment, not a schema
   change to any real application.
4. Configure these values in the **staging-only server environment**.
   All values in this example are placeholders:

   ~~~dotenv
   DSE_STAGING_ENVIRONMENT=true
   DATABASE_URL=postgresql://<stage-user>:<secret>@<neon-host>/<stage-db>?sslmode=require
   DSE_STAGING_DB_HOST=<neon-host>
   DSE_STAGING_DB_NAME=<stage-db>
   DSE_STAGING_DB_MARKER=DSE-PMS-STAGING:<unique-id>
   DSE_STAGING_FORBIDDEN_DB_HOSTS=<production-PMS-db-host>,<life-dashboard-db-host>
   ~~~

5. BEFORE any Prisma migration, seed or server start, from the monorepo root:

   ~~~bash
   bun run --cwd apps/backend db:staging:verify
   ~~~

   The verifier requires an explicit Neon hostname and expected database,
   requires TLS, forbids production hosts and a shared schema, and performs
   one read-only PostgreSQL query of current_database() and the database
   description marker. It prints neither credentials nor the connection URL.
   It fails closed if any required value or marker is wrong.

6. Only after a successful independent identity check, apply reviewed
   migrations to the new staging database and verify database security.

   ~~~bash
   bun run --cwd apps/backend db:migrate:deploy
   bun run --cwd apps/backend db:security:verify
   ~~~

   Seed only fabricated test fixtures after checking that the seed has no
   external side effects. Never run a production seed or reset.

## Phase B: Reuse Render Free preview carefully

Candidate is the old native Render service named dse-pms-pr-1144-backend,
ID srv-daogh1f40ujc73f7mvo0. The older build follows an unrelated
historical branch. Its start command currently invokes migrations **before**
starting the application; the backend start script itself runs migrations
too. The new DB guard MUST be first.

1. Read-only inspect the current Render service environment and existing
   database target. A secret value is not required in a report; only compare
   exact host/project identity privately. If it points at real production,
   do not deploy the branch until all old credentials are replaced safely.
2. Do not use production Supabase service-role keys, SMTP, Telegram, webhooks,
   real invitations, or notification channels in the staging configuration.
   Disable all unnecessary integrations.
3. After staging DB is verified, set the Render start command to:

   ~~~bash
   bun run --cwd apps/backend db:staging:verify && bun run --cwd apps/backend start
   ~~~

   This is the required order: staging identity preflight -> Prisma migrate
   deploy (already inside backend start) -> backend listens. Do not prefix
   the command with another migrate deploy.
4. Keep auto deploy disabled and deploy a specific reviewed feature commit.
   Retain existing Free plan; watch included hours, bandwidth and build minutes
   to avoid suspension or unapproved charges.

## Phase C: Authentication and frontend

**Important:** The repository currently supports production Supabase Auth or
local/test development JWTs. A Neon PostgreSQL database does not automatically
create a separate compatible Supabase Auth project. This is a second release
gate even after database provisioning.

- Never put a static development token in NEXT_PUBLIC_DEV_TOKEN or expose
  public AUTH_MODE=dev staging; do not reuse the real Supabase service-role key.
- Establish a safely isolated and explicitly approved authentication boundary
  using test-only identities. If this cannot be done at zero incremental cost,
  stop with the database staged but do NOT expose a student-facing server.
- Only then set the exact Vercel preview origin in CORS_ORIGIN, and configure
  the preview frontend to use the staging API and matching auth mode.
- A Vercel preview pointing to the real Render API is a visual preview, not
  proof of isolated staging.

## Phase D: Real staging verification

- Confirm $0 plan, account usage and expected DB provider project ID.
- Run staging DB identity guard, Prisma migrate and security checks.
- Restart the same Render commit twice, then recheck DB identity and test
  fixture persistence to demonstrate a durable DB.
- Validate test-only staff/student auth, least privilege, forbidden roles,
  safe web links, expiry, publication, archive, public portfolio evidence,
  review-note requirement, consent withdrawal and mobile layout.
- Record source commit, sanitized provider project ID, guard pass, test
  result, restart result, auth boundary and Render/Vercel costs in #1290.
- Keep feature PR #1285 draft until the real staging release gate passes.
  A code rollback does not undo a Prisma migration.

## Test the guard without any database

From the repository root:

~~~bash
bun install --frozen-lockfile
bun test apps/backend/scripts/verify-staging-db.test.ts
bun run typecheck
bun run lint
bun run test
bun run build
~~~

The test uses synthetic URLs and stubbed database query results. It does not
contact a cloud provider or mutate production records.
