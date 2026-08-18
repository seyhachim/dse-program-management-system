# Telegram Mini App Companion

Parent epic: #265  
Foundation/authentication: #266–#267  
MVP continuation: #268–#275

## Purpose and boundary

The Telegram Mini App is a lightweight mobile companion to DSE PMS. The existing PMS backend and PostgreSQL database remain the single source of truth for identity, roles, enrolment, schedules, announcements, results/CLO achievement, anonymous feedback, and attendance.

Telegram profile data never grants PMS authority. Complex course-specification authoring, programme administration, QA/SAR workflows, bulk grading, and database administration remain in the normal web PMS.

## Production environment

Configure these backend-only variables:

```env
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_MINI_APP_URL=https://your-pms.example/telegram
TELEGRAM_MINI_APP_SHORT_NAME=pms
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS=300
TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS=30
JWT_SECRET=use-a-strong-production-secret
```

`TELEGRAM_BOT_TOKEN` and `JWT_SECRET` are server secrets. Never expose them through `NEXT_PUBLIC_*`, browser configuration, logs, screenshots, Telegram messages, or deep links.

Keep `TELEGRAM_ENABLED=false` until the bot, HTTPS Mini App URL, migrations, and production secrets are configured. Enabled Telegram configuration with missing or malformed required values fails closed.

## Authentication and account linking

1. The browser sends the raw `Telegram.WebApp.initData` to `POST /api/telegram/auth/verify`.
2. The backend verifies Telegram's HMAC signature, freshness, bounded clock skew, and replay protection.
3. Verification yields a short-lived, single-use verification id plus the cryptographically verified numeric Telegram user id. Username/display name remain informational only.
4. An unlinked user must authenticate to PMS and call the protected account-link endpoint with that verification id.
5. Linking is transactional and enforces one PMS user ↔ one Telegram user. Conflicting identities fail safely.
6. Returning linked users receive a short-lived Mini App bearer session. The token contains identity references, not trusted role claims.
7. Every protected Mini App request re-checks that the identity is still active and reloads the PMS user's current programme-role assignments from PostgreSQL.
8. Revoking a link therefore invalidates an already-issued Mini App session on its next request.

Mini App session tokens are kept in browser `sessionStorage`, expire after 30 minutes, and are cleared after a `401`. Signed deep links expire after one hour and select only a destination; they never grant resource access.

## Authorization and academic-data reuse

All `/api/telegram/mini/*` endpoints require a valid Telegram Mini App session.

- Students obtain courses, announcements, published results/CLO data, and surveys through the existing Student Portal services, preserving enrolment, publication, anonymity, and current result-access rules.
- Lecturer class/attendance access is checked against the actual offering, assigned lecturer/co-lecturers, and current programme-scoped PMS roles before delegating to the existing offering attendance service.
- Deep-link resolution is session-protected, and the destination API still performs normal object-level authorization.
- Announcement recipients are derived from PMS enrolments joined to active Telegram identities; revoked/unlinked users are excluded and notification preferences are respected.
- Notification delivery has a unique identity/event claim so retries do not create duplicate sends for the same event.
- Sensitive Telegram lifecycle and mutation actions write audit-compatible events without storing Telegram init data, bearer tokens, bot secrets, or survey response content.

Class-monitor/sub-class-monitor Telegram actions are intentionally not invented here because the current PMS repository has no canonical class-monitor assignment/permission domain to reuse. Add those actions only after that core PMS authorization model exists.

## Database security

Telegram security state is isolated in the `telegram_security` PostgreSQL schema. Migrations enable RLS and revoke schema/table/function/sequence access from `PUBLIC` and Supabase Data API roles (`anon`, `authenticated`, `service_role`). The CI database-security verifier is fail-closed and includes negative probes for unclassified Telegram tables and forbidden grants.

Academic records remain in their existing PMS tables; Telegram does not maintain a competing grade, attendance, survey, course, or role store.

## Deployment verification

Before a controlled production pilot:

1. Apply all migrations to the target PostgreSQL/Supabase database and run the database-security verifier successfully.
2. Run root `typecheck`, `lint`, `test`, backend test discovery, and production `build` successfully.
3. Confirm the Mini App URL is HTTPS and BotFather points the official DSE bot/Mini App to that URL and configured short name.
4. Open `/telegram` directly in a normal browser and confirm it does not authenticate a user without verified Telegram init data.
5. Launch from the official Telegram bot and confirm signed init data verifies while tampered, stale, future-skewed, and replayed launches fail closed.
6. Link one pilot PMS account while authenticated. Confirm a second PMS account cannot claim the same Telegram user and the PMS account cannot silently switch to another Telegram identity.
7. Reopen the Mini App and confirm the server resolves current PMS roles/programme scope, not Telegram profile fields or cached client roles.
8. As a student, verify only enrolled classes and currently publishable result/CLO/feedback/survey data are visible.
9. As a lecturer, verify class detail and attendance are limited to assigned offerings or current programme-wide PMS authority; an arbitrary offering id must fail.
10. Verify a signed deep link opens its intended route but changing route/object ids cannot bypass the destination API's authorization.
11. Publish one pilot announcement. Confirm only active linked enrolled recipients with announcements enabled are targeted and a repeated delivery for the same event is deduplicated.
12. Revoke the Telegram link from PMS account settings and confirm the already-issued Mini App session receives `401` on its next protected request.
13. Review Telegram audit/delivery records for useful actor/resource/timestamp context and verify no bot token, bearer token, raw init data, or anonymous survey response is recorded.

## Revocation and incident response

### Revoke one user's access

1. Use the authenticated PMS account settings Telegram card to revoke the link.
2. Confirm `/api/telegram/account` reports `linked: false`.
3. Confirm the previous Mini App session receives `401` from a protected `/api/telegram/mini/*` endpoint.
4. Review `telegram_security.TelegramAuditEvent` for the user/identity.
5. Re-link only from a fresh cryptographically verified Telegram launch and the intended authenticated PMS account.

### Bot token exposure

Rotate/revoke `TELEGRAM_BOT_TOKEN` in BotFather, replace the production backend secret, and verify pilot notification delivery before enabling notifications again.

### JWT secret exposure

Rotate `JWT_SECRET` in the production backend. Existing tokens signed with the previous secret, including Telegram Mini App sessions and deep links, become invalid and must be reissued.

### Disable the integration

Set `TELEGRAM_ENABLED=false`. Do not delete or alter academic results, attendance, survey responses, or course records as part of Telegram incident response.

## Rollout

Start with a small DSE student/lecturer pilot. Validate real-device linking, revocation, class access, result publication boundaries, survey anonymity, attendance permissions, and notification delivery before programme-wide enablement.
