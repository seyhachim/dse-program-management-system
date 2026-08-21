# Public Ask DSE question analytics privacy and retention

Issue #491 adds a narrow information-gap log for the public Ask DSE experience. Its purpose is to help DSE staff identify questions that the published PMS information cannot answer confidently and improve the official FAQ content.

## What is retained

Only Ask DSE searches whose deterministic published-information result is either:

- a low-confidence set of confirmed FAQ suggestions; or
- no confirmed match.

Before persistence, the question is normalized and privacy-sanitized. Obvious email addresses, phone-like values, URLs, control characters, and excess input length are removed or replaced. The stored question field is therefore `questionTextSanitized`, not the literal network payload.

The analytics record may include the programme, public channel, normalized question, closest published FAQ slugs and scores, whether the bot response was delivered, review/resolution state, and timestamps.

Strong direct FAQ answers are not retained as question analytics. This prevents the feature from becoming a general conversation transcript store.

## What is not retained

The #491 analytics boundary does not accept or expose raw Telegram user IDs, chat IDs, usernames, display names, phone numbers, client IP addresses, webhook headers, bot secrets, or rate-limit counters/windows.

Issue #492 may later provide purpose-specific HMAC values for deduplication or privacy-preserving aggregation after a request has passed abuse-protection admission. Those values must be separate from rate-limit keys and must never be raw actor or network identifiers.

## Access

Question analytics are backend-owned and stored in the protected `public_analytics` PostgreSQL schema. Row-level security is enabled and direct Supabase Data API access is revoked from `anon`, `authenticated`, and `service_role` roles.

The PMS admin API requires authentication, programme permissions, and an Admin or Program Coordinator role in the selected programme. The admin response deliberately omits internal analytics actor hashes and source-event keys.

## Retention

Question events are retained for 180 days. Expired rows are removed opportunistically by the analytics service during reads and writes. Child suggestion rows cascade-delete with their parent event.

## Administrative use

Authorized staff can review recent gaps, identify repeated normalized questions, search/filter them, mark items reviewed or resolved, and create a Draft PMS FAQ from a sanitized question. Creating the FAQ draft does not publish it: the normal Public Information review and explicit publication workflow remains authoritative.

The data is intended only for public-information quality improvement. It is not used to infer personal attributes, build user profiles, or generate ungrounded answers.
