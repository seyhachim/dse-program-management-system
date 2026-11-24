-- Public website publication is intentionally separate from student publication.
ALTER TABLE "DseNewsArticle" ADD COLUMN "publicPublishedAt" TIMESTAMP(3);
CREATE INDEX "DseNewsArticle_programmeId_publicPublishedAt_idx"
  ON "DseNewsArticle"("programmeId", "publicPublishedAt");
-- No new Data API grants: RLS and backend-only table access are retained.
