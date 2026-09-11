ALTER TABLE "pms_attendance"."TeachingSessionDelivery"
  ADD COLUMN "learningSummary" TEXT NOT NULL DEFAULT '';

ALTER TABLE "pms_attendance"."TeachingSessionDelivery"
  ADD CONSTRAINT "TeachingSessionDelivery_learning_summary_length_check"
  CHECK (char_length("learningSummary") <= 1000);
