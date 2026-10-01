# Supabase → PMS identity boundary (#1142)

## Current production rule

PMS authorization is bound to the canonical `User.authId` and PMS-owned roles, **never** to a matching provider email. A signed Supabase JWT proves its UID, but it does not prove that the same UID has not acquired a new OAuth provider *after* that JWT was issued. For this interim password-only rollout the backend fetches the current Auth user from the Supabase Admin API on each Supabase-authenticated request, requires a confirmed matching email and exactly one `email` identity, then resolves the PMS User UID-first.

This intentionally **fails closed** for any currently linked Google, GitHub or other provider (including an old email JWT after auto-link); such users need identity review and safe recovery, not an automatic PMS role grant. It does not enable or complete the GitHub pilot (#1139) or Google pilot (#1141). Those features must provide independent, exact provider-identity approval, revocation, and hosted testing before the rule can change.

A historical `User` with no `authId` may be claimed only after current Admin email-identity verification and a guarded update of `authId: null`. An existing different UID always fails. No Student UUID, enrollment, result, approved CourseSpec, AUN-QA evidence, or role is migrated or rewritten.

## Rollout and rollback

1. Verify `AUTH_MODE=supabase`, `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` are configured on the **test** backend (never place values in logs, screenshots, GitHub, or `NEXT_PUBLIC_*`). In `AUTH_MODE=dev`, this check is not invoked.
2. Run the repository's full exact-head CI and isolated PostgreSQL security/authorization checks. In a **disposable** Auth/PMS setup, test legitimate password login → `/api/auth/me` → student own portal and mandatory password-change recovery, along with an independently created conflicting UID and a current unauthorized social identity. Do not test negative paths against real student records.
3. The production backend must be deployed together with the expected Supabase Admin credentials. Watch privacy-safe 401/403 rates and latency; Admin API downtime now denies access rather than trusting stale claims. Refreshing a browser session cannot bypass current live identity verification.
4. If legitimate users are denied, pause the rollout and investigate exact Auth identities privately. Prefer restoring prior code only as a documented emergency rollback with compensating access controls (disable third-party providers and verify UID conflicts), because prior code has a known account-takeover path. Do not force-link or edit a PMS identity to make login succeed.

## Performance and operational note

The live Admin identity check adds a network request to each protected API request. Do not introduce a long-lived identity cache without a secure invalidation/revocation design: it would reopen the stale-token auto-link window. Measure latency and plan an explicit provider-approval mechanism as part of #1139/#1141 instead.
