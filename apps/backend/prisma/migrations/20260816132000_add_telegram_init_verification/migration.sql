-- Issue #267: replay-resistant Telegram Mini App init-data verification.
-- Keep this security-only table in a dedicated PostgreSQL schema so it remains
-- separate from PMS academic/domain models. The application accesses it through
-- parameterized raw SQL in the Telegram integration boundary.

CREATE SCHEMA IF NOT EXISTS "telegram_security";

CREATE TABLE "telegram_security"."TelegramInitVerification" (
  "id" TEXT NOT NULL,
  "initDataDigest" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "queryId" TEXT,
  "authDate" TIMESTAMPTZ NOT NULL,
  "verifiedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "consumedAt" TIMESTAMPTZ,

  CONSTRAINT "TelegramInitVerification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramInitVerification_initDataDigest_key" UNIQUE ("initDataDigest")
);

CREATE INDEX "TelegramInitVerification_telegramUserId_idx"
  ON "telegram_security"."TelegramInitVerification"("telegramUserId");

CREATE INDEX "TelegramInitVerification_expiresAt_idx"
  ON "telegram_security"."TelegramInitVerification"("expiresAt");
