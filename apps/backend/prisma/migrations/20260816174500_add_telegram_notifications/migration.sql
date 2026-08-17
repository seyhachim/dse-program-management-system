CREATE TABLE "telegram_security"."TelegramNotificationPreference" (
  "identityId" TEXT NOT NULL,
  "announcementsEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramNotificationPreference_pkey" PRIMARY KEY ("identityId"),
  CONSTRAINT "TelegramNotificationPreference_identityId_fkey"
    FOREIGN KEY ("identityId") REFERENCES "telegram_security"."TelegramIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "telegram_security"."TelegramNotificationDelivery" (
  "id" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "resourceId" TEXT,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "telegramMessageId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramNotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TelegramNotificationDelivery_identityId_eventKey_key" UNIQUE ("identityId", "eventKey"),
  CONSTRAINT "TelegramNotificationDelivery_identityId_fkey"
    FOREIGN KEY ("identityId") REFERENCES "telegram_security"."TelegramIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TelegramNotificationDelivery_status_idx"
  ON "telegram_security"."TelegramNotificationDelivery"("status", "updatedAt");

DO $$
DECLARE role_name TEXT;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA "telegram_security" FROM %I', role_name);
  END LOOP;
END $$;
