-- Issue #209: append-only three-year Course Specification periodic review records.
CREATE TYPE "PeriodicReviewOutcome" AS ENUM ('Reaffirmed', 'MinorRevision', 'MajorRevision');

CREATE TABLE "CourseSpecPeriodicReview" (
  "id" UUID NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "scheduledReviewAt" TIMESTAMP(3) NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL,
  "evidenceSummary" TEXT NOT NULL,
  "decisionReason" TEXT NOT NULL,
  "outcome" "PeriodicReviewOutcome" NOT NULL,
  "createdRevisionId" TEXT,
  "nextReviewDueAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSpecPeriodicReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseSpecPeriodicReview_courseSpecId_fkey"
    FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSpecPeriodicReview_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSpecPeriodicReview_createdRevisionId_fkey"
    FOREIGN KEY ("createdRevisionId") REFERENCES "CourseSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSpecPeriodicReview_next_due_after_review_check"
    CHECK ("nextReviewDueAt" > "reviewedAt"),
  CONSTRAINT "CourseSpecPeriodicReview_revision_link_matches_outcome_check"
    CHECK (
      ("outcome" = 'Reaffirmed' AND "createdRevisionId" IS NULL)
      OR ("outcome" IN ('MinorRevision', 'MajorRevision') AND "createdRevisionId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "CourseSpecPeriodicReview_createdRevisionId_key"
  ON "CourseSpecPeriodicReview" ("createdRevisionId")
  WHERE "createdRevisionId" IS NOT NULL;
CREATE INDEX "CourseSpecPeriodicReview_courseSpecId_reviewedAt_idx"
  ON "CourseSpecPeriodicReview" ("courseSpecId", "reviewedAt" DESC);
CREATE INDEX "CourseSpecPeriodicReview_nextReviewDueAt_idx"
  ON "CourseSpecPeriodicReview" ("nextReviewDueAt");
CREATE INDEX "CourseSpecPeriodicReview_reviewerId_idx"
  ON "CourseSpecPeriodicReview" ("reviewerId");

ALTER TABLE "CourseSpecPeriodicReview" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CourseSpecPeriodicReview" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "CourseSpecPeriodicReview" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "CourseSpecPeriodicReview" FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE "CourseSpecPeriodicReview" FROM service_role';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION reject_course_spec_periodic_review_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CourseSpecPeriodicReview records are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CourseSpecPeriodicReview_append_only_update"
BEFORE UPDATE ON "CourseSpecPeriodicReview"
FOR EACH ROW EXECUTE FUNCTION reject_course_spec_periodic_review_mutation();

CREATE TRIGGER "CourseSpecPeriodicReview_append_only_delete"
BEFORE DELETE ON "CourseSpecPeriodicReview"
FOR EACH ROW EXECUTE FUNCTION reject_course_spec_periodic_review_mutation();
