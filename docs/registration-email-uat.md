# Registration email delivery UAT (#1364)

Provider selection is server-side. Existing Supabase invitations and account recovery remain unchanged. Registration OTP is the only consumer of the new reusable transport. Never enable production registration as part of UAT.

| Provider | Settings | Hosting |
|---|---|---|
| gmail-smtp | PMS_EMAIL_GMAIL_USER, PMS_EMAIL_GMAIL_APP_PASSWORD, PMS_EMAIL_FROM (same Gmail account) | Local or SMTP-capable host, implicit TLS on 465 |
| brevo | PMS_EMAIL_BREVO_API_KEY, PMS_EMAIL_FROM | HTTPS, including free Render |
| resend | PMS_EMAIL_RESEND_API_KEY, PMS_EMAIL_FROM | HTTPS, verified sender/domain |

Set PMS_EMAIL_PROVIDER explicitly. PMS_EMAIL_FROM_NAME is optional (DSE PMS). Configure the existing TELEGRAM_REGISTRATION_EMAIL_OTP_SECRET separately. No automatic fallback on failed or uncertain delivery. Provider acceptance does not prove inbox receipt.

**Free Render:** SMTP ports 25, 465, 587 are blocked. Do not set PMS_EMAIL_SMTP_ALLOWED on free Render, and do not upgrade or change hosting without authorization. Use Brevo with an authorized verified sender on the dedicated UAT service. Resend remains optional. Gmail can be tested on an SMTP-capable operator machine (not against production). Use a new app password for the dedicated account; never copy production SMTP secrets into staging or commit credentials.

## Manual smoke test (one authorized inbox)
From the repository, in a private local shell, set the provider settings using your secret manager or an untracked local environment file. Set DSE_STAGING_ENVIRONMENT=true, PMS_EMAIL_SMOKE_CONFIRM=SEND_ONE_TEST_EMAIL, PMS_EMAIL_SMOKE_TO to an inbox you control. Run:

```sh
bun apps/backend/scripts/smoke-registration-email.ts
```

The command sends one synthetic email, touches no database and creates no account. Confirm inbox receipt (including spam). Never use a student address for a test without permission. Unset smoke variables afterward. The script is not an HTTP endpoint.

## CI and release gates
Run provider unit tests and the synthetic registration DB journey. Verify Gmail authentication failure, no plaintext fallback, API errors, global and per-recipient quota, OTP verification, corrections, approval and Mini App access. Pilot caps reserve at most 30 challenge attempts per hour and 100 per rolling day, counting failed provider attempts. Gmail SMTP wire/TLS compatibility and actual inbox receipt still require operator UAT. No domain ownership is assumed; Brevo sender verification and any sender rewriting must be checked in the account. Use a separate test bot and protected frontend; never reconfigure the production bot webhook.
