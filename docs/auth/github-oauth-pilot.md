# GitHub sign-in: controlled student pilot (#1138)

GitHub OAuth is **not enabled by this code change**. Keep `NEXT_PUBLIC_GITHUB_PILOT_ENABLED` unset/false in production and do not advertise GitHub as a general login method until one consenting, nonprivileged active Student has completed the checks below. The existing Supabase email/password login and student-invitation flows remain available.

## One-time owner-side configuration

1. Use a staging/preview Supabase Auth project where possible. In GitHub Developer Settings create a GitHub **OAuth App**; set the homepage to the preview PMS URL and the **GitHub OAuth callback** to the exact URL displayed in Supabase Authentication → Sign In / Providers → GitHub (`https://<project-ref>.supabase.co/auth/v1/callback`).
2. Store the GitHub Client ID and Client Secret **in Supabase Auth provider settings only**. Never put the secret in Git, frontend variables, issues, screenshots, or chat.
3. Enable the GitHub provider and Supabase Auth **manual identity linking** on that project. Under Authentication → URL Configuration, allowlist the exact preview origin plus `/connect-github` and `/github-sign-in?callback=1&next=...` redirects. Limit the allowlist to trusted application origins, not a wildcard production domain.
4. Deploy the branch preview with `NEXT_PUBLIC_AUTH_MODE=supabase`, the preview project's normal public Supabase URL/key, and `NEXT_PUBLIC_GITHUB_PILOT_ENABLED=true`. Keep production's flag false until review and UAT pass. Never use a public GitHub OAuth App secret as a `NEXT_PUBLIC_` variable.
5. Use an **existing, authorized PMS student account** with a verified Supabase email/password session. The student must voluntarily complete GitHub consent; no one should request their GitHub password. Do not create synthetic Student IDs, replace PMS auth IDs, or change academic records.

## Controlled UAT (one consenting student)

- [ ] On preview, existing PMS password login works and `/api/auth/me` returns the correct Student UUID and student role.
- [ ] From that authenticated session visit `/connect-github`, click **Connect GitHub securely**, approve the GitHub OAuth consent, and return to the same PMS account. Confirm linked GitHub in Supabase user identities.
- [ ] Sign out. Visit `/github-sign-in`, click **Continue with GitHub**, and verify the same PMS User UUID, correct enrollments, and **only that student's** visible information.
- [ ] Try an unlinked GitHub account, a GitHub account whose email matches another existing PMS record, and a GitHub account with only a personal email: `/api/auth/me` must deny unprovisioned or mismatched UIDs. Use synthetic/controlled test identities, not other students' credentials.
- [ ] Confirm a password-login account with a different linked Supabase UID cannot be taken over by matching its email. Verify safe `next` and Telegram-linking return paths, logout, mobile experience, and no duplicate PMS Students/Users.
- [ ] Confirm that no existing Student UUID, enrollment, attendance, result, CourseSpec, QA evidence, or official Student ID was changed. Capture redacted verification evidence without tokens or identifiable student details.
- [ ] Run Prisma validate/migration verification, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, and relevant security/authorization checks; inspect all GitHub CI on the exact PR head.

## Important behavior and limitations

Supabase performs its own automatic linking for some **matching verified provider emails**; manual `linkIdentity` is the explicit self-service flow for GitHub accounts with different email addresses. PMS **never** binds a GitHub identity to an existing User using GitHub email alone: the backend requires the *same verified Supabase UID* or refuses access. Unknown GitHub identities may appear in Supabase Auth after an unsuccessful OAuth attempt, but are not provisioned as PMS Users or Students.

The historical fallback for PMS Users without an `authId` remains limited to a Supabase **email** provider account that the Supabase Admin API confirms has the same UID/email and a confirmed email. Existing users with a different `authId` are rejected without rewriting their linkage. If a test student's PMS account is still only an unactivated invitation, establish their original PMS access through the existing authorized provisioning process first; GitHub is not a substitute for verifying which Student they are.

The pilot routes intentionally remain undiscoverable from the production sign-in page. After UAT, add the regular login/settings entry points in a separate reviewed rollout; do not enable a global GitHub sign-in button prematurely.
