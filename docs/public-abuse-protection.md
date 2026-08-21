# Public DSE abuse protection

Issue #492 adds bounded admission controls around the unauthenticated DSE programme-information surfaces without changing authenticated Telegram Mini App authentication.

## Protected surfaces

- Telegram public webhook: webhook secret verification happens before Telegram update validation and downstream bot work.
- Telegram updates: a global update bucket and a per-chat bucket bound repeated work.
- Telegram callbacks: a dedicated per-chat callback bucket applies after the normal update admission check; callback data above Telegram's 64-byte limit is rejected safely.
- Telegram Ask DSE: a separate per-chat bucket runs before public search and unanswered-question analytics.
- Public programme search: a programme-level bucket bounds `/api/programme/public/programmes/:programmeId/search` work while ordinary published reads remain cacheable and unaffected.
- Malformed or configured-oversize Telegram updates are acknowledged and ignored so Telegram does not amplify abuse through retries.

## Default thresholds

All thresholds are positive-integer environment variables and can be tuned independently:

| Variable | Default | Meaning |
| --- | ---: | --- |
| `PUBLIC_SEARCH_RATE_LIMIT_MAX` | 300 | Public search requests per programme/window |
| `PUBLIC_SEARCH_RATE_LIMIT_WINDOW_SECONDS` | 60 | Public search window |
| `TELEGRAM_GLOBAL_UPDATE_RATE_LIMIT_MAX` | 600 | Telegram public updates per process/window |
| `TELEGRAM_ACTOR_UPDATE_RATE_LIMIT_MAX` | 60 | Telegram public updates per chat/window |
| `TELEGRAM_CALLBACK_RATE_LIMIT_MAX` | 30 | Telegram callbacks per chat/window |
| `TELEGRAM_ASK_DSE_RATE_LIMIT_MAX` | 20 | Ask DSE free-text searches per chat/window |
| `TELEGRAM_RATE_LIMIT_WINDOW_SECONDS` | 60 | Telegram limiter window |
| `TELEGRAM_PUBLIC_MAX_UPDATE_BYTES` | 32768 | Maximum serialized Telegram update accepted by the public router |

The defaults are intentionally above normal prospective-student interaction rates while still bounding repeated automated work.

## Privacy boundary with #491

Raw Telegram chat/user identifiers are never passed into unanswered-question analytics. The abuse limiter derives operational keys with purpose-separated HMACs. Only after an Ask DSE request is admitted, the Telegram router derives separate analytics-only HMACs for `sourceEventKey` and `analyticsActorHash`.

The domains are deliberately different, for example:

- `telegram-rate-limit:actor:v1`
- `telegram-rate-limit:ask-dse:v1`
- `ask-dse-analytics-event:v1`
- `ask-dse-analytics-actor:v1`

Rate-limit counters, windows, remaining capacity, raw chat IDs, usernames, IP addresses, and other Telegram identity fields do not cross the #491 analytics boundary. A rate-limited Ask DSE request is not recorded as an unanswered question.

## Runtime behavior

The limiter is an in-process fixed-window guard with an explicit 10,000-bucket memory bound and expiry sweeping. This matches the current single backend-service process deployment and avoids adding a second identity-bearing persistence store. If the backend is horizontally scaled, each process enforces its own bounded limits; production edge/provider throttling or a privacy-preserving shared limiter should be added before relying on a cluster-wide numeric threshold.

Public HTTP search returns HTTP `429` with a generic response and `Retry-After`. Telegram rate-limit decisions return HTTP `200` with a small acknowledgement so Telegram does not retry the same update. Rejections intentionally avoid detailed server state.

## Mini App boundary

The authenticated Telegram Mini App router remains mounted separately from `/api/telegram/public`. Issue #492 does not change initData verification, linking, JWT issuance, or authenticated Mini App authorization.
