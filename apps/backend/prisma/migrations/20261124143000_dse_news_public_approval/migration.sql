-- Explicit second publication gate: existing student-published DSE articles remain private.
-- Public-read endpoints require Published AND a non-NULL publicPublishedAt.
ALTER TABLE "DseNewsArticle" ADD COLUMN "publicPublishedAt" TIMESTAMP(3);
CREATE INDEX "DseNewsArticle_programmeId_publicPublishedAt_idx"
  ON "DseNewsArticle"("programmeId","publicPublishedAt");
ALTER TABLE "DseNewsArticle"
  ADD CONSTRAINT "dse_news_public_state_check"
  CHECK ("publicPublishedAt" IS NULL OR "status" = 'Published');
ALTER TABLE "DseNewsAuditEvent" DROP CONSTRAINT IF EXISTS "dse_news_audit_action_check";
ALTER TABLE "DseNewsAuditEvent"
  ADD CONSTRAINT "dse_news_audit_action_check"
  CHECK ("action" IN ('created','updated','published','unpublished','archived','public_published','public_unpublished'));
-- No public table grants: all access goes through explicit privacy-filtered backend.
