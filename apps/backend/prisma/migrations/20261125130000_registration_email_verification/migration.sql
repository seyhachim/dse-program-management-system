-- Email remains mandatory for activation, not for a saved incomplete application.
ALTER TABLE "telegram_security"."StudentRegistrationRequest"
  ALTER COLUMN "email" DROP NOT NULL,
  ADD COLUMN "emailVerifiedAt" TIMESTAMPTZ,
  ADD CONSTRAINT "RegistrationVerifiedEmail_check" CHECK ("emailVerifiedAt" IS NULL OR "email" IS NOT NULL);
CREATE TABLE "telegram_security"."StudentRegistrationEmailSession" (
  "verificationId" TEXT PRIMARY KEY REFERENCES "telegram_security"."TelegramInitVerification"("id") ON DELETE CASCADE
);
CREATE TABLE "telegram_security"."StudentRegistrationEmailChallenge" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL REFERENCES "telegram_security"."StudentRegistrationRequest"("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 5),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "consumedAt" TIMESTAMPTZ,
  "deliveryAcceptedAt" TIMESTAMPTZ
);
CREATE INDEX "RegistrationEmailChallenge_request_created_idx" ON "telegram_security"."StudentRegistrationEmailChallenge" ("requestId","createdAt");
CREATE INDEX "RegistrationEmailChallenge_email_created_idx" ON "telegram_security"."StudentRegistrationEmailChallenge" ("email","createdAt");
DO $$
DECLARE table_name TEXT; role_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['StudentRegistrationEmailSession','StudentRegistrationEmailChallenge']
  LOOP
    EXECUTE format('ALTER TABLE "telegram_security".%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE "telegram_security".%I FROM PUBLIC',table_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE "telegram_security".%I FROM %I',table_name,role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
