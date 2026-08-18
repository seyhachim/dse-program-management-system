CREATE SCHEMA IF NOT EXISTS "course_spec_governance";

REVOKE ALL ON SCHEMA "course_spec_governance" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA "course_spec_governance" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA "course_spec_governance" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON SCHEMA "course_spec_governance" FROM service_role;
  END IF;
END
$$;

CREATE TABLE "course_spec_governance"."CourseSpecPeriodicReview" (
  "id" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "scheduledDueAt" DATE,
  "reviewedAt" DATE NOT NULL,
  "evidenceSummary" TEXT NOT NULL,
  "decisionReason" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "createdRevisionId" TEXT,
  "nextReviewDueAt" DATE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CourseSpecPeriodicReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseSpecPeriodicReview_outcome_check"
    CHECK ("outcome" IN ('Reaffirmed', 'MinorRevision', 'MajorRevision')),
  CONSTRAINT "CourseSpecPeriodicReview_evidence_check"
    CHECK (char_length(btrim("evidenceSummary")) >= 3),
  CONSTRAINT "CourseSpecPeriodicReview_reason_check"
    CHECK (char_length(btrim("decisionReason")) >= 3),
  CONSTRAINT "CourseSpecPeriodicReview_reaffirmed_revision_check"
    CHECK (
      ("outcome" = 'Reaffirmed' AND "createdRevisionId" IS NULL AND "nextReviewDueAt" IS NOT NULL)
      OR
      ("outcome" IN ('MinorRevision', 'MajorRevision') AND "createdRevisionId" IS NOT NULL AND "nextReviewDueAt" IS NULL)
    ),
  CONSTRAINT "CourseSpecPeriodicReview_source_fkey"
    FOREIGN KEY ("courseSpecId") REFERENCES "public"."CourseSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSpecPeriodicReview_reviewer_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CourseSpecPeriodicReview_created_revision_fkey"
    FOREIGN KEY ("createdRevisionId") REFERENCES "public"."CourseSpec"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CourseSpecPeriodicReview_createdRevisionId_key"
  ON "course_spec_governance"."CourseSpecPeriodicReview"("createdRevisionId")
  WHERE "createdRevisionId" IS NOT NULL;
CREATE INDEX "CourseSpecPeriodicReview_courseSpecId_reviewedAt_idx"
  ON "course_spec_governance"."CourseSpecPeriodicReview"("courseSpecId", "reviewedAt" DESC, "createdAt" DESC);
CREATE INDEX "CourseSpecPeriodicReview_reviewerId_idx"
  ON "course_spec_governance"."CourseSpecPeriodicReview"("reviewerId");
CREATE INDEX "CourseSpecPeriodicReview_nextReviewDueAt_idx"
  ON "course_spec_governance"."CourseSpecPeriodicReview"("nextReviewDueAt")
  WHERE "nextReviewDueAt" IS NOT NULL;

CREATE OR REPLACE FUNCTION "course_spec_governance"."reject_periodic_review_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'CourseSpecPeriodicReview is append-only';
END;
$$;

CREATE TRIGGER "CourseSpecPeriodicReview_immutable"
BEFORE UPDATE OR DELETE ON "course_spec_governance"."CourseSpecPeriodicReview"
FOR EACH ROW EXECUTE FUNCTION "course_spec_governance"."reject_periodic_review_mutation"();

ALTER TABLE "course_spec_governance"."CourseSpecPeriodicReview" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "course_spec_governance"."CourseSpecPeriodicReview" FROM PUBLIC;
REVOKE ALL ON FUNCTION "course_spec_governance"."reject_periodic_review_mutation"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "course_spec_governance"."CourseSpecPeriodicReview" FROM anon;
    REVOKE ALL ON FUNCTION "course_spec_governance"."reject_periodic_review_mutation"() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "course_spec_governance"."CourseSpecPeriodicReview" FROM authenticated;
    REVOKE ALL ON FUNCTION "course_spec_governance"."reject_periodic_review_mutation"() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "course_spec_governance"."CourseSpecPeriodicReview" FROM service_role;
    REVOKE ALL ON FUNCTION "course_spec_governance"."reject_periodic_review_mutation"() FROM service_role;
  END IF;
END
$$;
