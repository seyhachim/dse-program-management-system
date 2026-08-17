-- Issue #208: persist the governance decision that created each academic revision.
-- The request is append-only evidence. Corrections require a new revision request;
-- UPDATE/DELETE are rejected at the database layer.

CREATE TABLE "CourseSpecRevisionRequest" (
  "id" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "evidenceSummary" TEXT NOT NULL,
  "proposedRevisionType" "CourseSpecRevisionType" NOT NULL,
  "recommendedRevisionType" "CourseSpecRevisionType" NOT NULL,
  "overrideJustification" TEXT NOT NULL DEFAULT '',
  "effectiveAcademicTerm" TEXT NOT NULL,
  "impactCourseCodeOrTitle" BOOLEAN NOT NULL DEFAULT false,
  "impactCreditsOrSlt" BOOLEAN NOT NULL DEFAULT false,
  "impactPrerequisites" BOOLEAN NOT NULL DEFAULT false,
  "impactMaterialCloChanges" BOOLEAN NOT NULL DEFAULT false,
  "impactBloomOrCapLevels" BOOLEAN NOT NULL DEFAULT false,
  "impactCloPloAlignment" BOOLEAN NOT NULL DEFAULT false,
  "impactAssessmentStructureOrWeighting" BOOLEAN NOT NULL DEFAULT false,
  "impactCurriculumOrRegulatoryAlignment" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CourseSpecRevisionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CourseSpecRevisionRequest_non_initial_types_check"
    CHECK ("proposedRevisionType" <> 'Initial' AND "recommendedRevisionType" <> 'Initial'),
  CONSTRAINT "CourseSpecRevisionRequest_override_check"
    CHECK (
      "recommendedRevisionType" <> 'Major'
      OR "proposedRevisionType" <> 'Minor'
      OR length(trim("overrideJustification")) >= 10
    )
);

CREATE UNIQUE INDEX "CourseSpecRevisionRequest_courseSpecId_key"
  ON "CourseSpecRevisionRequest"("courseSpecId");
CREATE INDEX "CourseSpecRevisionRequest_requestedById_createdAt_idx"
  ON "CourseSpecRevisionRequest"("requestedById", "createdAt");

ALTER TABLE "CourseSpecRevisionRequest"
  ADD CONSTRAINT "CourseSpecRevisionRequest_courseSpecId_fkey"
  FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CourseSpecRevisionRequest"
  ADD CONSTRAINT "CourseSpecRevisionRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "prevent_course_spec_revision_request_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'CourseSpec revision request metadata is immutable';
END;
$$;

CREATE TRIGGER "CourseSpecRevisionRequest_immutable"
BEFORE UPDATE OR DELETE ON "CourseSpecRevisionRequest"
FOR EACH ROW EXECUTE FUNCTION "prevent_course_spec_revision_request_mutation"();

ALTER TABLE "CourseSpecRevisionRequest" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "CourseSpecRevisionRequest" FROM PUBLIC;
REVOKE ALL ON TABLE "CourseSpecRevisionRequest" FROM anon;
REVOKE ALL ON TABLE "CourseSpecRevisionRequest" FROM authenticated;
REVOKE ALL ON TABLE "CourseSpecRevisionRequest" FROM service_role;

REVOKE ALL ON FUNCTION "prevent_course_spec_revision_request_mutation"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "prevent_course_spec_revision_request_mutation"() FROM anon;
REVOKE ALL ON FUNCTION "prevent_course_spec_revision_request_mutation"() FROM authenticated;
REVOKE ALL ON FUNCTION "prevent_course_spec_revision_request_mutation"() FROM service_role;
