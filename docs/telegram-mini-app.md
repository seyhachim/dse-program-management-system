# Telegram Mini App Foundation

Issue: #266  
Parent epic: #265

## Purpose

The Telegram Mini App is a lightweight mobile companion to the DSE PMS. The existing PMS backend and PostgreSQL database remain the single source of truth.

This foundation intentionally does **not** authenticate Telegram users, link Telegram accounts to PMS users, expose student/lecturer data, or send production notifications. Those capabilities belong to later issues.

## Architecture

```text
Telegram
   |
   v
Next.js /telegram
   |
   v
PMS Backend /api/telegram/*
   |
   +-- existing PMS plugins and data
```

The backend registers Telegram through the existing plugin registry. Public endpoints are:

- `GET /api/telegram/config`
- `GET /api/telegram/health`

`/api/telegram/config` returns public integration metadata only. It must never return the bot token or other server credentials.

## Environment variables

Configure these in `apps/backend/.env`:

```env
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_MINI_APP_URL=http://localhost:3000/telegram
TELEGRAM_MINI_APP_SHORT_NAME=pms
```

`TELEGRAM_BOT_TOKEN` is server-only. Never create a `NEXT_PUBLIC_TELEGRAM_BOT_TOKEN` variable.

When `TELEGRAM_ENABLED=false`, the normal PMS starts without Telegram credentials. When Telegram is enabled, all required Telegram values must be present and the Mini App URL must be valid.

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

## Security boundary for #266

Do not use `Telegram.WebApp.initDataUnsafe.user` as trusted identity. Signed Telegram init-data verification is implemented separately in #267.

Do not add Telegram/PMS account persistence in this issue. Account linking belongs to #268.
