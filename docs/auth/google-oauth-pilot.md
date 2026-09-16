# DSE PMS Google sign-in: controlled student pilot (#1140)

**Default: OFF. Do not enable Google sign-in in production.** This is stacked on PR #1139's UID-first, fail-closed account-matching fix. No broad rollout or new student provisioning is included. Read the [server-side identity approval and recovery runbook](./google-provider-approval.md) before any preview OAuth test.

## Identity and academic-integrity boundary

`Student.id`, official `Student.studentId`, `Student.userId`, `User.id`, `User.authId`, enrollments, results and QA evidence remain unchanged. Matching Google email, roster Gmail or self-entered student details never authorizes PMS access. A student must first sign into their existing authorized PMS account and explicitly connect Google, or undergo independently documented operator identity verification. The frontend checks the original UID and `/api/auth/me`; **these checks alone cannot prevent Supabase's automatic email-based linking**.

The backend now checks the exact Google identity ID against an independently approved UID/identity-ID pair in `GOOGLE_OAUTH_APPROVED_IDENTITIES` **before any legacy PMS email claim**. Missing or conflicting approval returns 403. Supabase may still automatically link an OAuth identity upstream; this gate restricts PMS API authorization, not Supabase's own identity management. Before enabling the pilot, verify hosted JWT metadata and automatic-link behavior with disposable accounts in an isolated Supabase Auth project, and test safe recovery if an unwanted identity was auto-linked. An unintended Google link can temporarily block even the existing password login while an unapproved Google provider appears in its JWT.

A read-only production database audit found 113 Students, only one Gmail-domain `Student.email` and no dedicated personal Gmail database column. **Do not assume the original registration form's personal Gmail responses are stored in `Student.email`.** Do not rewrite those addresses, institutional IDs or Student/User links for this pilot.

## Owner-only setup (no credentials in Git or chat)

1. Keep Google Cloud Audience `External` and `Testing`, with only an operator and one consenting nonprivileged student as test users; use `openid email profile` scopes only. Set the real frontend origin and Supabase-provided OAuth callback URI in the Google Cloud Web client.
2. Store Google Client ID and Secret in Supabase Authentication > Providers > Google. Keep nonce checks enabled and require email. Google Cloud's redirect URI points to Supabase, **not** to the PMS frontend.
3. Allowlist the exact HTTPS frontend redirects `/connect-google?callback=1` and `/google-sign-in?callback=1` in Supabase Authentication > URL Configuration. Avoid wildcard redirect domains. Enable manual identity linking for `linkIdentity` only in the isolated preview after the operator runbook and rollback are tested.
4. Backend-only `GOOGLE_OAUTH_APPROVED_IDENTITIES` is a JSON object keyed by the verified Supabase UID with the exact Google identity `id` as value, approved after independent student/Google ownership verification. Leave it unset for all unapproved accounts. Never expose it as `NEXT_PUBLIC_*` or fill it from email/name. See the runbook for safe recovery and revocation.
5. Turn `NEXT_PUBLIC_GOOGLE_PILOT_ENABLED=true` **only in an isolated preview** after the backend approval gate, safe-hosted-provider semantics, rollback and test student are confirmed. Password login and Telegram `next` remain available. No generic Google button is added to `/login` in this PR.

## Hosted Auth test evidence (16 September 2026)

An operator-owned disposable account in a separate hosted Supabase Auth project was successfully linked to Google using the local standalone test page: the unchanged UID showed `email` and `google` identities. Signed-out Google sign-in returned the same UID. An initially rejected password and rate-limited recovery-email attempts were observed; the operator subsequently reported setting a fresh disposable password while signed in with Google and signing back in with that password. Details, limitations, and the remaining test matrix are recorded in [the redacted hosted Auth test report](./google-hosted-auth-test-2026-09-16.md). **This is not automatic same-email link testing, isolated PMS authorization testing, production recovery certification, or student UAT.**

## One-student preview UAT

Record the test account's canonical identifiers privately. With the pilot flag off, verify the routes refuse use and password login still works. In isolated Auth, test a disposable matching-email Google sign-in without independent approval: it must yield PMS 403, with no PMS User claim, role grant or academic-record mutation. Prove the Google provider appears in the verified JWT metadata, independently verify/approve the *exact* Google identity ID and same Supabase UID, then verify the consenting student's own portal access. Test an incorrect UID/identity ID, a different student, non-student user, duplicate identity, replayed callback, account switching, expired session, safe `next`/Telegram return, sign-out and existing password login. Verify an unwanted link can be safely revoked without changing student/academic records. Do not use active production student accounts for adversarial tests or store credentials/PII in PR evidence.

## Later Microsoft transition

Add university Microsoft Entra to the **same existing Supabase/PMS user** only after verified linking or approved identity proofing. Run Google and Microsoft together during transition; verify recovery before retiring Google. Never bulk replace `User.authId`, `Student.userId`, official IDs or academic data based on matching emails.

## Merge gates

PR #1139 must pass its own acceptance criteria and merge first. On #1141's exact final head verify `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, Prisma validation and CI migration/security/authorization/API-contract jobs; inspect the root PR template and #1140 checkboxes. Isolated Supabase **automatic** same-email linking, recent reauthentication, real PMS authorization and cross-student tests, durable auditable approval and recovery, one-student UAT, explicit rollback and owner-approved configuration remain required before this feature is considered release-ready. The production pilot flag remains off.
