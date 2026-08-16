# Telegram Mini App Foundation

Parent epic: #265  
Foundation: #266  
Signed init-data verification: #267

## Purpose

The Telegram Mini App is a lightweight mobile companion to the DSE PMS. The existing PMS backend and PostgreSQL database remain the single source of truth.

The integration now verifies signed Telegram Mini App launch data on the backend. It still does **not** link Telegram accounts to PMS users, infer PMS roles from Telegram profile data, or expose protected student/lecturer data before account linking. Those capabilities belong to later issues, beginning with #268.

## Architecture

```text
Telegram
   |
   | Telegram.WebApp.initData
   v
Next.js /telegram
   |
   v
PMS Backend /api/telegram/*
   |
   +-- signed init-data verification
   +-- replay-resistant verification context
   +-- existing PMS plugins and data (only after later account linking)
```

The backend registers Telegram through the existing plugin registry. Public endpoints are:

- `GET /api/telegram/config`
- `GET /api/telegram/health`
- `POST /api/telegram/auth/verify`

`/api/telegram/config` returns public integration metadata only. It must never return the bot token or other server credentials.

## Environment variables

Configure these in `apps/backend/.env`:

```env
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_MINI_APP_URL=http://localhost:3000/telegram
TELEGRAM_MINI_APP_SHORT_NAME=pms
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS=300
TELEGRAM_INIT_DATA_MAX_FUTURE_SKEW_SECONDS=30
```

`TELEGRAM_BOT_TOKEN` is server-only. Never create a `NEXT_PUBLIC_TELEGRAM_BOT_TOKEN` variable.

When `TELEGRAM_ENABLED=false`, the normal PMS starts without Telegram credentials. When Telegram is enabled, all required Telegram values must be present and the Mini App URL must be valid.

The default init-data policy accepts launch data up to five minutes old and tolerates at most 30 seconds of future clock skew. Both values are server-side configuration and invalid non-positive values fail configuration validation.

## BotFather setup

1. Create or select the DSE PMS bot in BotFather.
2. Configure a Mini App for the bot.
3. Set the Mini App URL to the deployed `/telegram` route.
4. Set the Mini App short name to match `TELEGRAM_MINI_APP_SHORT_NAME`.
5. Store the bot token only in the backend deployment environment.

Use HTTPS for deployed Mini App URLs.

## Local development

No Docker-specific setup is required.

```bash
bun install
bun run dev
```

Frontend: `http://localhost:3000/telegram`  
Backend: `http://localhost:4000`

For local foundation testing, keep `TELEGRAM_ENABLED=false` unless you are explicitly testing enabled configuration.

## Signed init-data verification

The browser must send the raw value from `Telegram.WebApp.initData` to:

```http
POST /api/telegram/auth/verify
Content-Type: application/json
```

```json
{
  "initData": "query_id=...&user=...&auth_date=...&hash=..."
}
```

The backend:

1. parses the signed query string and rejects duplicate/malformed required fields;
2. builds Telegram's alphabetically sorted data-check string, excluding `hash`;
3. derives the HMAC-SHA-256 secret from the server-only bot token using `WebAppData`;
4. compares the received and expected hashes with a timing-safe comparison;
5. validates `auth_date` freshness and bounded future clock skew;
6. normalizes the verified Telegram user id to a string; and
7. atomically records a SHA-256 digest of the verified raw init data so the same launch payload cannot be reused.

Replay records are stored in the dedicated PostgreSQL `telegram_security` schema. The raw init data, bot token, derived HMAC key, and expected hash are never persisted.

A successful response is a **pre-link Telegram identity context** only:

```json
{
  "verified": true,
  "verificationId": "uuid",
  "telegramUser": {
    "id": "123456789",
    "username": "optional"
  },
  "authDate": "2026-08-16T05:00:00.000Z",
  "expiresAt": "2026-08-16T05:05:00.000Z"
}
```

This response must not contain a PMS user id, PMS role, permission, JWT, session token, enrolment, grade, attendance record, or other academic data. Issue #268 is responsible for proving a PMS identity and consuming this verified Telegram context during explicit account linking.

Do not use `Telegram.WebApp.initDataUnsafe.user` as trusted identity. It is display/convenience data only; authorization must be based on server-validated `initData` and then normal PMS authorization after linking.

## Verification errors

The verification endpoint fails closed with stable categories:

- `400 INVALID_INIT_DATA` — malformed request body
- `401 INVALID_INIT_DATA` — signed launch data could not be authenticated
- `401 INIT_DATA_EXPIRED` — validly structured launch data is stale or outside allowed clock skew
- `409 INIT_DATA_REPLAYED` — the same valid launch payload was already accepted
- `503 TELEGRAM_DISABLED` — Telegram integration is disabled

Cryptographic details, raw init data, and bot secrets must not be returned in error bodies or logs.

## Deep-link convention

Start payloads are versioned. The foundation currently supports:

```text
v1_home
```

Future resource links may extend the convention using opaque identifiers, for example `v1_class_<opaque-id>`.

Rules:

- A deep link selects a destination; it never establishes identity or grants authorization.
- Never include JWTs, session tokens, roles, grades, student email addresses, or other sensitive academic data in a start payload.
- Unsupported, malformed, and oversized payloads must fail safely.

## Security boundary after #267

Signed Telegram launch data can now prove which Telegram user opened the Mini App recently, subject to the configured freshness and replay rules.

That proof is **not** a PMS login. Telegram username, display name, client-supplied roles, or a verified Telegram id alone must never grant access to protected PMS data. PMS account linking and revocation are implemented separately in #268.
