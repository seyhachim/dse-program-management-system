-- Assessment learning-domain level is derived from the linked CLOs, so the
-- duplicated assessment-level bloomLevel column is removed. Feedback fields are
-- additive and default to empty strings so existing assessment rows remain valid.
ALTER TABLE "CourseSpecAssessmentItem"
  ADD COLUMN "feedbackMethod" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "feedbackTimeline" TEXT NOT NULL DEFAULT '',
  DROP COLUMN "bloomLevel";
