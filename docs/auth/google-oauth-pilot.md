# DSE PMS Google sign-in: controlled student pilot (#1140)

**Default: OFF. Do not enable `NEXT_PUBLIC_GOOGLE_PILOT_ENABLED` in production until the prerequisites and security tests below pass.** This branch is stacked on the fail-closed account-matching fix in PR #1139 (#1138). The Google pilot does not replace institutional identity proofing, invitations, or password login.

## Identity and academic-integrity boundary

- `Student.id`, official `Student.studentId`, `Student.userId`, `User.id`, and existing `User.authId` remain unchanged by Google identity linking. Do not copy student/enrollment/assessment/QA records into a new user.
- A Google email (even verified), personal Gmail recorded in a registration form, self-entered student ID, display name, and university-looking email are **not** sufficient to claim a PMS account. There is no auto-provisioning endpoint here.
- An eligible student first signs in with an existing authorized PMS account (or completes separately audited administrator identity verification). Only then may they explicitly link a Google identity through Supabase `linkIdentity`, which must attach to the **same Supabase UID**.
- `GET /api/auth/me` remains the authoritative PMS permission and account check. A valid Supabase token alone cannot authorize PMS access. The pilot sign-in route refuses unprovisioned/unauthorized sessions and signs them out.
- **Important blocker:** Supabase may automatically link certain verified provider emails to an existing Supabase account. A browser-side `getUserIdentities()` check is not proof of explicit PMS-approved linking. Before switching the pilot flag on, inspect the exact hosted Supabase auto-linking behavior and demonstrate that a Google email cannot acquire an existing PMS UID without explicit approved linking. If this cannot be established, keep the pilot disabled and implement a server-side, auditable provider-identity allowlist before rollout. Do not infer safety merely from passing the client tests.

## Configuration (owner only; never commit credentials)

1. Google Cloud: OAuth consent audience `External`, `Testing`; add only the consenting test student and authorized operator as test users. Request standard `openid email profile` only.
2. Google Cloud Web OAuth client: set the actual deployed frontend origin as an authorized JavaScript origin; set the **exact** Supabase `Authentication > Providers > Google > Callback URL (for OAuth)` as an authorized redirect URI.
3. Supabase: paste the Google Client ID/secret into Auth > Providers > Google. Keep nonce verification enabled and require email. Never paste a secret into Git, issues or screenshots. Confirm actual provider state separately; saving credentials does not prove the provider is enabled or the redirect works.
4. Supabase Auth URL Configuration: allow only the intended HTTPS frontend callback `https://<actual-frontend-host>/connect-google?callback=1` and `https://<actual-frontend-host>/google-sign-in?callback=1` (and exact preview callback URLs only where necessary). Do not allow arbitrary wildcard domains. These app callbacks are distinct from the Google Cloud redirect URI, which points to Supabase.
5. Supabase Auth manual identity linking must be enabled for `linkIdentity`. Leave existing email/password and approved recovery routes available.
6. Set `NEXT_PUBLIC_GOOGLE_PILOT_ENABLED=true` **only on an isolated preview**, after verifying the server-side identity boundary; it is `false` by default. No general Google login button is added to `/login` by this PR.

## Controlled UAT (one consenting, nonprivileged student only)

- Capture the existing PMS `User.id`, Supabase `User.authId`, `Student.id`, role and visible course identifiers in a restricted test record; do not put personal data in a PR or logs.
- With the pilot flag OFF, both `/connect-google` and `/google-sign-in` refuse the pilot. Existing password sign-in, recovery and Telegram return path work.
- With the flag ON **on the isolated preview**, student signs into their existing PMS account, visits `/connect-google`, explicitly connects their own Google account, returns to the same Supabase UID and same authorized student.
- Log out, then visit `/google-sign-in`; the linked Google account opens only the student's own portal. The internal `next` path is restored; the external provider redirect contains no Telegram token. Check logout and password login still work.
- Negative cases: unknown Google user, roster Gmail-only match, conflicting existing `authId`, duplicate identity, replayed callback, cross-student access, unauthorized lecturer/admin, wrong Google account, abandoned consent, account switch during linking, malicious `next`, and missing/expired session. All must fail closed. Explicitly test any Supabase automatic email-linking behavior with disposable accounts in an isolated Auth project; no real student records.
- Check account/academic identifiers before and after; no grade, attendance, CourseSpec, curriculum or QA evidence mutation. Verify redacted auditability, rollback by turning off the pilot flag, and removal of unwanted provider identities only through an approved reauthentication process.

## Later Microsoft transition

Add the university Entra provider to the **same existing Supabase/PMS user** only after authenticated explicit linking or approved identity proofing. Run Google and Microsoft side-by-side, verify all students' linked identities and a recovery path, then decide separately if Google login can be retired. Never bulk replace `User.authId`, `Student.userId`, institutional IDs, or academic records based on matching emails.

## Merge / rollout gates

Run `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` and the repository's Prisma validation/migration/security/API-contract CI jobs on the **exact PR head**. Check the root `pull_request_template.md` and issue #1140 acceptance criteria. The UI remains off by default until the hosted Supabase identity-link behavior, one-student preview UAT, role boundaries and rollback are verified; no production feature enablement is part of this PR.
