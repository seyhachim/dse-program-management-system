-- A review decision is committed independently of Telegram delivery.
ALTER TABLE "telegram_security"."StudentRegistrationReview"
  ADD COLUMN "notificationState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED'
    CHECK ("notificationState" IN ('NOT_REQUESTED','PENDING','SENDING','SENT','FAILED')),
  ADD COLUMN "notificationMessageId" TEXT,
  ADD COLUMN "notificationUpdatedAt" TIMESTAMPTZ;
