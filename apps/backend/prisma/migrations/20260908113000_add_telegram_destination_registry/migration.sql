CREATE SCHEMA IF NOT EXISTS "telegram_security";

CREATE TABLE "telegram_security"."TelegramDestination" (
  "id" TEXT PRIMARY KEY,
  "programmeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "chatId" TEXT,
  "chatTitle" TEXT,
  "chatType" TEXT NOT NULL DEFAULT 'SUPERGROUP',
  "botKind" TEXT NOT NULL DEFAULT 'PMS',
  "audienceType" TEXT NOT NULL,
  "scopeId" TEXT,
  "purpose" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "verifiedAt" TIMESTAMPTZ,
  "verifiedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramDestination_programme_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE,
  CONSTRAINT "TelegramDestination_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "TelegramDestination_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "TelegramDestination_chatType_check" CHECK ("chatType" IN ('GROUP','SUPERGROUP','CHANNEL')),
  CONSTRAINT "TelegramDestination_botKind_check" CHECK ("botKind" IN ('PMS','PUBLIC_INFO')),
  CONSTRAINT "TelegramDestination_audience_check" CHECK ("audienceType" IN ('ALL_LECTURERS','ALL_STUDENTS','COHORT','CLASS_SECTION','CUSTOM')),
  CONSTRAINT "TelegramDestination_status_check" CHECK ("status" IN ('PENDING','OBSERVED','CONNECTED','DISABLED')),
  CONSTRAINT "TelegramDestination_scope_check" CHECK (("audienceType" IN ('COHORT','CLASS_SECTION')) = ("scopeId" IS NOT NULL))
);

CREATE UNIQUE INDEX "TelegramDestination_programme_audience_scope_bot_key"
  ON "telegram_security"."TelegramDestination" ("programmeId", "audienceType", COALESCE("scopeId", ''), "botKind")
  WHERE "enabled" = TRUE AND "status" = 'CONNECTED';
CREATE UNIQUE INDEX "TelegramDestination_bot_chat_key"
  ON "telegram_security"."TelegramDestination" ("botKind", "chatId") WHERE "chatId" IS NOT NULL AND "status" = 'CONNECTED';
CREATE INDEX "TelegramDestination_programme_status_idx"
  ON "telegram_security"."TelegramDestination" ("programmeId", "status", "updatedAt" DESC);

CREATE TABLE "telegram_security"."TelegramDestinationRegistration" (
  "id" TEXT PRIMARY KEY,
  "destinationId" TEXT NOT NULL,
  "tokenDigest" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "consumedAt" TIMESTAMPTZ,
  "observedChatId" TEXT,
  "observedChatTitle" TEXT,
  "observedChatType" TEXT,
  "observedAt" TIMESTAMPTZ,
  "confirmedAt" TIMESTAMPTZ,
  "confirmedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramDestinationRegistration_destination_fkey" FOREIGN KEY ("destinationId") REFERENCES "telegram_security"."TelegramDestination"("id") ON DELETE CASCADE,
  CONSTRAINT "TelegramDestinationRegistration_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "TelegramDestinationRegistration_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "TelegramDestinationRegistration_chatType_check" CHECK ("observedChatType" IS NULL OR "observedChatType" IN ('GROUP','SUPERGROUP','CHANNEL'))
);
CREATE INDEX "TelegramDestinationRegistration_destination_idx"
  ON "telegram_security"."TelegramDestinationRegistration" ("destinationId", "createdAt" DESC);

CREATE TABLE "telegram_security"."TelegramDestinationDelivery" (
  "id" TEXT PRIMARY KEY,
  "destinationId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "telegramMessageId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramDestinationDelivery_destination_fkey" FOREIGN KEY ("destinationId") REFERENCES "telegram_security"."TelegramDestination"("id") ON DELETE CASCADE,
  CONSTRAINT "TelegramDestinationDelivery_status_check" CHECK ("status" IN ('pending','sent','failed')),
  CONSTRAINT "TelegramDestinationDelivery_event_key" UNIQUE ("destinationId", "eventKey")
);
CREATE INDEX "TelegramDestinationDelivery_destination_updated_idx"
  ON "telegram_security"."TelegramDestinationDelivery" ("destinationId", "updatedAt" DESC);
CREATE INDEX "TelegramDestinationDelivery_status_updated_idx"
  ON "telegram_security"."TelegramDestinationDelivery" ("status", "updatedAt");

ALTER TABLE "telegram_security"."TelegramDestination" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "telegram_security"."TelegramDestinationRegistration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "telegram_security"."TelegramDestinationDelivery" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "telegram_security"."TelegramDestination" FROM PUBLIC;
REVOKE ALL ON TABLE "telegram_security"."TelegramDestinationRegistration" FROM PUBLIC;
REVOKE ALL ON TABLE "telegram_security"."TelegramDestinationDelivery" FROM PUBLIC;
REVOKE ALL ON TABLE "telegram_security"."TelegramDestination" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "telegram_security"."TelegramDestinationRegistration" FROM anon, authenticated, service_role;
REVOKE ALL ON TABLE "telegram_security"."TelegramDestinationDelivery" FROM anon, authenticated, service_role;
