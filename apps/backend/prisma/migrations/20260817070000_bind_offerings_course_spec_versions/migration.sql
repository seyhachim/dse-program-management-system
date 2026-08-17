-- Issue #211: bind each delivered Offering to one exact approved CourseSpec version.
-- The column stays nullable so deployment is safe for legacy rows whose historical
-- version cannot be proven. Application create/update paths require an explicit
-- approved binding; runtime academic writes fail closed while a legacy row is null.

ALTER TABLE "Offering" ADD COLUMN "courseSpecId" TEXT;
CREATE INDEX "Offering_courseSpecId_idx" ON "Offering"("courseSpecId");
ALTER TABLE "Offering"
  ADD CONSTRAINT "Offering_courseSpecId_fkey"
  FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill tier 1: authoritative historical evidence. AssessmentResult and
-- OfferingAssessmentDeadline already snapshot the CourseSpec id used when the
-- academic record was written. Bind only when all evidence for an offering agrees
-- on one Approved spec belonging to that offering's course. Conflicting evidence is
-- deliberately left unresolved rather than guessed.
WITH evidence AS (
  SELECT e."offeringId", ar."courseSpecId"
  FROM "AssessmentResult" ar
  INNER JOIN "Enrollment" e ON e."id" = ar."enrollmentId"
  UNION ALL
  SELECT d."offeringId", d."courseSpecId"
  FROM "OfferingAssessmentDeadline" d
), resolved AS (
  SELECT "offeringId", MIN("courseSpecId") AS "courseSpecId"
  FROM evidence
  GROUP BY "offeringId"
  HAVING COUNT(DISTINCT "courseSpecId") = 1
)
UPDATE "Offering" o
SET "courseSpecId" = resolved."courseSpecId"
FROM resolved
INNER JOIN "CourseSpec" cs ON cs."id" = resolved."courseSpecId"
WHERE o."id" = resolved."offeringId"
  AND cs."courseId" = o."courseId"
  AND cs."reviewStatus" = 'Approved';

-- Backfill tier 2: no historical evidence and exactly one Approved CourseSpec for
-- the course. Multiple Approved versions are ambiguous and stay null for explicit
-- administrator repair through the Offering edit form.
WITH evidence_offerings AS (
  SELECT e."offeringId"
  FROM "AssessmentResult" ar
  INNER JOIN "Enrollment" e ON e."id" = ar."enrollmentId"
  UNION
  SELECT d."offeringId" FROM "OfferingAssessmentDeadline" d
), sole_approved AS (
  SELECT "courseId", MIN("id") AS "courseSpecId"
  FROM "CourseSpec"
  WHERE "reviewStatus" = 'Approved'
  GROUP BY "courseId"
  HAVING COUNT(*) = 1
)
UPDATE "Offering" o
SET "courseSpecId" = sole_approved."courseSpecId"
FROM sole_approved
WHERE o."courseId" = sole_approved."courseId"
  AND o."courseSpecId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM evidence_offerings evidence WHERE evidence."offeringId" = o."id"
  );

CREATE OR REPLACE FUNCTION "validate_offering_course_spec_binding"()
RETURNS TRIGGER AS $$
DECLARE
  spec_course_id TEXT;
  spec_status "CourseSpecReviewStatus";
BEGIN
  IF NEW."courseSpecId" IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD."courseSpecId" IS NOT NULL THEN
      RAISE EXCEPTION 'An Offering CourseSpec binding cannot be cleared once set';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "courseId", "reviewStatus"
  INTO spec_course_id, spec_status
  FROM "CourseSpec"
  WHERE "id" = NEW."courseSpecId";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offering CourseSpec version does not exist';
  END IF;
  IF spec_course_id IS DISTINCT FROM NEW."courseId" THEN
    RAISE EXCEPTION 'Offering CourseSpec version belongs to another course';
  END IF;
  IF spec_status <> 'Approved' THEN
    RAISE EXCEPTION 'Offering may only bind an Approved CourseSpec version';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."courseSpecId" IS NOT NULL
    AND NEW."courseSpecId" IS DISTINCT FROM OLD."courseSpecId"
  THEN
    IF OLD."status" <> 'Planned'
      OR EXISTS (SELECT 1 FROM "OfferingAssessmentDeadline" d WHERE d."offeringId" = OLD."id")
      OR EXISTS (
        SELECT 1
        FROM "AssessmentResult" ar
        INNER JOIN "Enrollment" e ON e."id" = ar."enrollmentId"
        WHERE e."offeringId" = OLD."id"
      )
    THEN
      RAISE EXCEPTION 'Historical Offering CourseSpec binding is immutable after delivery or academic data';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Offering_validate_course_spec_binding"
BEFORE INSERT OR UPDATE OF "courseSpecId", "courseId" ON "Offering"
FOR EACH ROW EXECUTE FUNCTION "validate_offering_course_spec_binding"();

-- Result/deadline provenance must always agree with the Offering binding. This
-- closes direct-DB/future-code paths that could otherwise write evidence under a
-- newer CourseSpec while the Offering remains bound to its historical version.
CREATE OR REPLACE FUNCTION "enforce_offering_course_spec_on_academic_row"()
RETURNS TRIGGER AS $$
DECLARE
  bound_spec_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'AssessmentResult' THEN
    SELECT o."courseSpecId"
    INTO bound_spec_id
    FROM "Enrollment" e
    INNER JOIN "Offering" o ON o."id" = e."offeringId"
    WHERE e."id" = NEW."enrollmentId";
  ELSE
    SELECT o."courseSpecId"
    INTO bound_spec_id
    FROM "Offering" o
    WHERE o."id" = NEW."offeringId";
  END IF;

  IF bound_spec_id IS NULL THEN
    RAISE EXCEPTION 'Offering must be bound to an Approved CourseSpec before academic data can be written';
  END IF;
  IF NEW."courseSpecId" IS DISTINCT FROM bound_spec_id THEN
    RAISE EXCEPTION 'Academic record CourseSpec must match the Offering bound CourseSpec version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentResult_enforce_offering_course_spec"
BEFORE INSERT OR UPDATE OF "enrollmentId", "courseSpecId" ON "AssessmentResult"
FOR EACH ROW EXECUTE FUNCTION "enforce_offering_course_spec_on_academic_row"();

CREATE TRIGGER "OfferingAssessmentDeadline_enforce_course_spec"
BEFORE INSERT OR UPDATE OF "offeringId", "courseSpecId" ON "OfferingAssessmentDeadline"
FOR EACH ROW EXECUTE FUNCTION "enforce_offering_course_spec_on_academic_row"();
