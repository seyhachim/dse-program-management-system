# Hosted Supabase Auth pilot evidence — 2026-09-16

Issue #1140 / draft PR #1141. **Isolated Auth testing only; NOT a PMS authorization or production UAT sign-off.** This records the operator's observed disposable-account experiment, without publishing account email, UUID, identity IDs, tokens, keys, passwords, or screenshot URLs.

## Environment and procedure

- A separate hosted Supabase project (`dse-pms-auth-test`) was used with its own Google Cloud OAuth web client and an operator-controlled disposable Gmail account. The existing production PMS project, student accounts, PMS backend and academic database were not connected to the local test page.
- The operator created a confirmed email/password user, recorded its UID privately, configured the isolated Google provider and `http://localhost:3000/auth/callback`, and used a standalone local browser client pointed only at the isolated Supabase project.
- The operator connected Google to the signed-in disposable account. The browser's `getUserIdentities()` output showed the original UID with both `email` and `google` identities and no error. The Supabase test dashboard independently showed both providers on the same Auth user.
- The operator signed out, used the separate signed-out Google sign-in flow, and observed the same UID and both identities with no error.
- An initial password sign-in failed with `Invalid login credentials`. Password-recovery email requests subsequently hit the isolated project's email rate limit, and an earlier local recovery callback failed to establish a session. These are **observed failures**, not successful recovery tests.
- After signing in with Google, the operator used a revised isolated client to set a fresh disposable Supabase password and reported signing out and signing back in with that new password. The resulting screenshot showed the same UID. This supports a **manual password-login happy path after reset**, but does not establish a tested production-grade reauthentication/recovery flow.
- A read-only query against the isolated test project's `auth.users`/`auth.identities` confirmed a verified account with a stored password hash and both `email`/`google` identities. A password hash alone does not establish that any specific password works.

## What the result proves and does not prove

The hosted experiment demonstrates that Supabase can attach Google to an existing confirmed email user without changing its Auth UID, and that the same linked UID can sign in through Google. An operator-reported password reset and sign-in also recovered the disposable password path. **It does not demonstrate** what happens when a signed-out *unlinked* verified-email Google account is first presented; the explicit `linkIdentity()` happy path and automatic same-email linking must not be conflated. It also does not prove the PMS server's Google approval gate, access to one's own Student records, denial of a second student's records, or recent reauthentication.

## Outstanding isolated PMS/hosted-auth test matrix (do not run against real students)

- [ ] Separate disposable account: signed-out same-email Google first sign-in; record actual Supabase auto-link semantics, JWT provider metadata immediately and after refresh, and effect on password sessions.
- [ ] Wire a disposable **PMS database and backend** to the isolated Supabase Auth project, with synthetic Student A and Student B records, independent of production; verify `GET /api/auth/me` returns 403 for an unapproved linked Google identity, including a stale email-only JWT.
- [ ] Wrong UID, wrong/duplicate Google identity, unknown user and non-student return 403, with no PMS `User.authId` claim, role grant or Student changes.
- [ ] After **independent operator identity verification** and exact `(Supabase UID, Google identity ID)` approval, Student A can access only A's permitted records, cannot access B's records, and the canonical User/Student IDs and academic evidence remain unchanged.
- [ ] Explicit consent and recent reauthentication before initiating link; account switch, OAuth callback replay/expiry, logout/login and password recovery/rollback tested end to end.
- [ ] Dependent #1139 merged and rebased; exact-head CI, Prisma validation/migrations, typecheck, lint, tests, build, API and permissions reviewed; one consenting nonprivileged student's preview UAT; root PR template and all #1140 acceptance criteria checked.

**Release control:** keep the production Supabase Google provider and `NEXT_PUBLIC_GOOGLE_PILOT_ENABLED` disabled. Never copy disposable Auth identities into live PMS `User.authId` or alter student, enrollment, grades, attendance, SAR or AUN-QA records for this test.
