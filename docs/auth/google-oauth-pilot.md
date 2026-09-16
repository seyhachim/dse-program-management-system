# DSE PMS Google sign-in: controlled student pilot (#1140)

**Default: OFF; do not enable in production.** This PR is stacked on draft #1139. No broad rollout, account auto-provisioning or Student UUID rewrite. Read [the audited approval and recovery runbook](./google-provider-approval.md) before any owner-controlled preview test.

## Identity and academic-integrity boundary

`Student.id`, official `Student.studentId`, `Student.userId`, `User.id`, `User.authId`, enrollments, results and QA evidence must remain unchanged. Matching Google email, roster Gmail or self-entered student details never authorizes PMS access. Supabase can **automatically link verified matching-email identities upstream** without a PMS approval. Frontend checks alone cannot prevent this.

On every potentially authorized Supabase API request, the backend verifies current Supabase Admin identities even if JWT metadata is stale. A Google identity requires an existing bound PMS User, a nonprivileged student role, exactly one current Google identity, backend `GOOGLE_OAUTH_APPROVAL_ENABLED=true`, and the latest restricted append-only database event approving that exact `(User.id, Supabase UID, Google identity ID)`. Unapproved/revoked, wrong or duplicate identity, unknown account or Auth/audit outage fail closed. The old `GOOGLE_OAUTH_APPROVED_IDENTITIES` JSON environment allowlist is ignored. The server checks approval before an email-only legacy claim, so a Gmail address cannot claim an unbound PMS User.

A read-only audit found 113 Students, one Gmail-domain `Student.email`, and no verified personal Gmail database column. Do not use `Student.email` as an assumed personal Gmail roster or modify production records for the pilot.

## Owner-only isolated preview (no secrets in Git or chat)

1. In a **separate** Supabase Auth project and disposable **migrated and seeded PMS database**, configure server-only `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` and `AUTH_MODE=supabase`. Keep backend `GOOGLE_OAUTH_APPROVAL_ENABLED=false` except during explicit isolated UAT. Keep frontend `NEXT_PUBLIC_GOOGLE_PILOT_ENABLED=false` in production; both flags must be enabled only in a dedicated preview.
2. In Google Cloud use a Web OAuth client with the **test** Supabase callback URL, restricted test audience, `openid email profile`, and secrets stored only in test Supabase Authentication > Providers. Set the exact frontend redirect allow-list for `/google-link/callback` and `/google-sign-in?callback=1`; no wildcard domains. The Google Cloud callback points to Supabase, not the PMS frontend.
3. Student starts `/connect-google` from an authorized active PMS session. The student explicitly consents and enters their **existing PMS password**; the backend validates the password with Supabase Auth for the same UID and records a 30-minute single-use intent. Frontend confirms unchanged UID, then `linkIdentity` redirects to the public `/google-link/callback`. This callback confirms same UID and one Google identity; it **does not enter the PMS shell** while approval is pending.
4. An **independent** global administrator verifies official student identity, direct consent and Google identity ownership. The admin password is reverified server-side; `/api/auth/google/approve` consumes the student's fresh intent and appends an audit decision with exact identity and a restricted ticket reference (no PII or credentials). Approval or revocation changes protected API access on the next request. See [approval and recovery procedures](./google-provider-approval.md).
5. Supabase can silently attach a matching Google identity before consent; the backend will block that UID, potentially including password sessions. Recovery requires authorized manual provider removal and original-account identity proof, not merely turning off the UI flag. The preview must prove recovery and no academic-record mutations before any student UAT.

## Evidence as of 16 September 2026

A disposable operator account in a separate hosted Supabase Auth project explicitly linked Google, then signed out and signed in with Google and subsequently with a newly set password on the same Auth UID. The operator initially observed failed password login and rate-limited recovery mail. See [redacted test evidence](./google-hosted-auth-test-2026-09-16.md). These observations do **not** prove automatic first-time same-email linking, real hosted PMS authorization, approval/revocation/recovery, or a consenting student's UAT. Synthetic CI backend tests use local mock JWKS/Admin and disposable PostgreSQL, not real hosted Auth.

## Release checklist

Test first-time automatic verified-email linking and JWT refresh with a **second disposable owned identity** in test Auth; negative unapproved/wrong identity and account-switch/replay paths; expired and reused consent; administrator approval/revocation; safe original-password recovery and rollback. Connect the hosted **test** Auth to an isolated, seeded PMS backend and synthetic database; verify approved own student portal data and second-student denial, with no Student/User/academic writes. Finish #1139's own acceptance criteria and merge only when safe, rebase #1141, complete one consenting nonprivileged student's preview UAT, and check exact final-head Prisma validation/migration/security, typecheck, lint, tests, build, permissions and API contracts. Production Google login remains disabled until an explicit separate rollout decision.

## Later Microsoft transition

Link university Microsoft Entra to the same existing Supabase/PMS UID after independent verification and an approved recovery procedure. Never replace canonical `User.authId`, `Student.userId`, official IDs, results or QA evidence based on matching email.
