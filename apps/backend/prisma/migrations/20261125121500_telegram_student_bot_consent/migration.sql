-- Private bot onboarding state; phone data is never supplied by the public form.
CREATE TABLE "telegram_security"."StudentRegistrationBotConsent" (
  "telegramUserId" TEXT PRIMARY KEY,
  "phone" TEXT,
  "consentAt" TIMESTAMPTZ,
  "state" TEXT NOT NULL CHECK ("state" IN ('AWAITING_CONTACT', 'SHARED', 'SKIPPED')),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  CHECK (("state" = 'SHARED' AND "phone" IS NOT NULL AND "consentAt" IS NOT NULL)
    OR ("state" IN ('AWAITING_CONTACT', 'SKIPPED') AND "phone" IS NULL AND "consentAt" IS NULL))
);
CREATE INDEX "StudentRegistrationBotConsent_expiry_idx" ON "telegram_security"."StudentRegistrationBotConsent" ("expiresAt");
ALTER TABLE "telegram_security"."StudentRegistrationBotConsent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "telegram_security"."StudentRegistrationBotConsent" FROM PUBLIC;
DO $$
DECLARE role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "telegram_security"."StudentRegistrationBotConsent" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
ALTER TABLE "telegram_security"."StudentRegistrationRequest"
  ADD COLUMN "telegramPhone" TEXT,
  ADD COLUMN "phoneConsentAt" TIMESTAMPTZ,
  ADD CONSTRAINT "RegistrationPhoneConsent_check" CHECK (
    ("telegramPhone" IS NULL AND "phoneConsentAt" IS NULL)
    OR ("telegramPhone" IS NOT NULL AND "phoneConsentAt" IS NOT NULL)
  );
