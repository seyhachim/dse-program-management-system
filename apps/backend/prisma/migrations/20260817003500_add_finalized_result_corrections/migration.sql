-- Issue #333: finalized assessment results may only change through an append-only,
-- reasoned correction record. Preserve publication/finalization provenance and
-- protect the roster/evidence that gives an official result its academic context.

CREATE TABLE "AssessmentResultCorrection" (
  "id" TEXT NOT NULL,
  "assessmentResultId" TEXT NOT NULL,
  "beforeScore" DOUBLE PRECISION NOT NULL,
  "beforeMaxScore" DOUBLE PRECISION NOT NULL,
  "beforeFeedback" TEXT NOT NULL,
  "afterScore" DOUBLE PRECISION NOT NULL,
  "afterMaxScore" DOUBLE PRECISION NOT NULL,
  "afterFeedback" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "correctedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentResultCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentResultCorrection_reason_not_blank" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "AssessmentResultCorrection_after_score_nonnegative" CHECK ("afterScore" >= 0),
  CONSTRAINT "AssessmentResultCorrection_after_maxScore_positive" CHECK ("afterMaxScore" > 0),
  CONSTRAINT "AssessmentResultCorrection_after_score_lte_maxScore" CHECK ("afterScore" <= "afterMaxScore")
);

CREATE INDEX "AssessmentResultCorrection_assessmentResultId_createdAt_idx"
  ON "AssessmentResultCorrection"("assessmentResultId", "createdAt");
CREATE INDEX "AssessmentResultCorrection_correctedById_idx"
  ON "AssessmentResultCorrection"("correctedById");

ALTER TABLE "AssessmentResultCorrection"
  ADD CONSTRAINT "AssessmentResultCorrection_assessmentResultId_fkey"
  FOREIGN KEY ("assessmentResultId") REFERENCES "AssessmentResult"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentResultCorrection"
  ADD CONSTRAINT "AssessmentResultCorrection_correctedById_fkey"
  FOREIGN KEY ("correctedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing rows predate these database checks. NOT VALID keeps the migration
-- backward-compatible while PostgreSQL still enforces each constraint on all
-- new/updated rows.
ALTER TABLE "AssessmentResult"
  ADD CONSTRAINT "AssessmentResult_score_nonnegative" CHECK ("score" >= 0) NOT VALID,
  ADD CONSTRAINT "AssessmentResult_maxScore_positive" CHECK ("maxScore" > 0) NOT VALID,
  ADD CONSTRAINT "AssessmentResult_score_lte_maxScore" CHECK ("score" <= "maxScore") NOT VALID;

CREATE OR REPLACE FUNCTION "protect_finalized_assessment_result"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."finalizedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Finalized assessment results cannot be deleted; use the controlled correction workflow';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."finalizedAt" IS NOT NULL THEN
    IF NEW."enrollmentId" IS DISTINCT FROM OLD."enrollmentId"
      OR NEW."courseSpecId" IS DISTINCT FROM OLD."courseSpecId"
      OR NEW."assessmentItemId" IS DISTINCT FROM OLD."assessmentItemId"
      OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
      OR NEW."publishedById" IS DISTINCT FROM OLD."publishedById"
      OR NEW."finalizedAt" IS DISTINCT FROM OLD."finalizedAt"
      OR NEW."finalizedById" IS DISTINCT FROM OLD."finalizedById"
    THEN
      RAISE EXCEPTION 'Finalized result identity and publication/finalization provenance are immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentResult_protect_finalized"
BEFORE UPDATE OR DELETE ON "AssessmentResult"
FOR EACH ROW
EXECUTE FUNCTION "protect_finalized_assessment_result"();

CREATE OR REPLACE FUNCTION "protect_finalized_criterion_evidence"()
RETURNS TRIGGER AS $$
DECLARE
  result_id TEXT;
BEGIN
  result_id := CASE WHEN TG_OP = 'INSERT' THEN NEW."assessmentResultId" ELSE OLD."assessmentResultId" END;

  IF EXISTS (
    SELECT 1 FROM "AssessmentResult"
    WHERE "id" = result_id AND "finalizedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Criterion evidence for a finalized result is immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentCriterionScore_protect_finalized"
BEFORE INSERT OR UPDATE OR DELETE ON "AssessmentCriterionScore"
FOR EACH ROW
EXECUTE FUNCTION "protect_finalized_criterion_evidence"();

-- Finalization freezes the offering roster. The Offering row lock serializes
-- this trigger with publish/finalize transactions so a concurrent roster change
-- cannot slip between readiness validation and the finalization write.
CREATE OR REPLACE FUNCTION "protect_roster_after_result_finalization"()
RETURNS TRIGGER AS $$
DECLARE
  old_offering_id TEXT;
  new_offering_id TEXT;
BEGIN
  old_offering_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD."offeringId" END;
  new_offering_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW."offeringId" END;

  -- Lock in deterministic id order when an UPDATE could involve two offerings.
  PERFORM 1
  FROM "Offering"
  WHERE "id" IN (old_offering_id, new_offering_id)
  ORDER BY "id"
  FOR UPDATE;

  IF old_offering_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM "AssessmentResult" ar
    JOIN "Enrollment" e ON e."id" = ar."enrollmentId"
    WHERE e."offeringId" = old_offering_id
      AND ar."finalizedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Offering roster is locked because finalized results exist';
  END IF;

  IF new_offering_id IS NOT NULL
    AND new_offering_id IS DISTINCT FROM old_offering_id
    AND EXISTS (
      SELECT 1
      FROM "AssessmentResult" ar
      JOIN "Enrollment" e ON e."id" = ar."enrollmentId"
      WHERE e."offeringId" = new_offering_id
        AND ar."finalizedAt" IS NOT NULL
    )
  THEN
    RAISE EXCEPTION 'Offering roster is locked because finalized results exist';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Enrollment_protect_finalized_roster"
BEFORE INSERT OR UPDATE OR DELETE ON "Enrollment"
FOR EACH ROW
EXECUTE FUNCTION "protect_roster_after_result_finalization"();

CREATE OR REPLACE FUNCTION "protect_assessment_result_correction_history"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Assessment result correction history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AssessmentResultCorrection_append_only"
BEFORE UPDATE OR DELETE ON "AssessmentResultCorrection"
FOR EACH ROW
EXECUTE FUNCTION "protect_assessment_result_correction_history"();

-- Academic correction history is backend-only. Supabase Data API roles receive
-- no permissive policy, so RLS remains fail-closed even if default grants exist.
ALTER TABLE "AssessmentResultCorrection" ENABLE ROW LEVEL SECURITY;
