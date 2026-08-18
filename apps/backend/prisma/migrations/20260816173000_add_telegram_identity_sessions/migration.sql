-- Issues #268-#275: secure Telegram identity lifecycle and Mini App audit trail.
-- Kept in the dedicated telegram_security schema so Telegram access remains a
-- thin companion boundary and never becomes a competing academic data model.

CREATE SCHEMA IF NOT EXISTS "telegram_security";

CREATE TABLE "telegram_security"."TelegramIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "telegramUsername" TEXT,
  "linkedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastVerifiedAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramIdentity_userId_key" UNIQUE ("userId"),
  CONSTRAINT "TelegramIdentity_telegramUserId_key" UNIQUE ("telegramUserId"),
  CONSTRAINT "TelegramIdentity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TelegramIdentity_active_idx"
  ON "telegram_security"."TelegramIdentity"("telegramUserId", "revokedAt");

CREATE TABLE "telegram_security"."TelegramAuditEvent" (
  "id" TEXT NOT NULL,
  "identityId" TEXT,
  "userId" TEXT,
  "telegramUserId" TEXT,
  "action" TEXT NOT NULL,
  "resourceType" TEXT,
  "resourceId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramAuditEvent_identityId_fkey"
    FOREIGN KEY ("identityId") REFERENCES "telegram_security"."TelegramIdentity"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TelegramAuditEvent_user_created_idx"
  ON "telegram_security"."TelegramAuditEvent"("userId", "createdAt" DESC);
CREATE INDEX "TelegramAuditEvent_telegram_created_idx"
  ON "telegram_security"."TelegramAuditEvent"("telegramUserId", "createdAt" DESC);

-- Link verification is single-use. Existing #267 rows remain valid and are
-- consumed atomically by the linking operation.
CREATE INDEX IF NOT EXISTS "TelegramInitVerification_consumed_idx"
  ON "telegram_security"."TelegramInitVerification"("consumedAt", "expiresAt");

-- Browser/Data API roles must not gain access to Telegram identity/security data.
DO $$
DECLARE role_name TEXT;
BEGIN
  REVOKE ALL ON SCHEMA "telegram_security" FROM PUBLIC;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA "telegram_security" FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA "telegram_security" FROM %I', role_name);
  END LOOP;
END $$;
