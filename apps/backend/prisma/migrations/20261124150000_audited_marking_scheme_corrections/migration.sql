-- Keep the existing append-only correction ledger. Only audited updates to
-- the score of a finalized marking-scheme question are permitted.
ALTER TABLE "AssessmentResultCorrection" ADD COLUMN "questionChanges" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "AssessmentResultCorrection" ADD CONSTRAINT "AssessmentResultCorrection_questionChanges_array" CHECK (jsonb_typeof("questionChanges") = 'array');

CREATE OR REPLACE FUNCTION "protect_finalized_criterion_evidence"()
RETURNS TRIGGER AS $$
DECLARE
  result_id TEXT;
BEGIN
  result_id := CASE WHEN TG_OP = 'INSERT' THEN NEW."assessmentResultId" ELSE OLD."assessmentResultId" END;
  IF EXISTS (SELECT 1 FROM "AssessmentResult" WHERE "id" = result_id AND "finalizedAt" IS NOT NULL) THEN
    IF TG_OP <> 'UPDATE' THEN
      RAISE EXCEPTION 'Criterion evidence for a finalized result is immutable';
    END IF;
    IF OLD."rubricContentHash" NOT LIKE 'marking-scheme-v1:%'
       OR (to_jsonb(NEW) - 'score' - 'updatedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'score' - 'updatedAt')
       OR NOT EXISTS (
         SELECT 1 FROM "AssessmentResultCorrection" c
         JOIN "AssessmentResult" ar ON ar.id = c."assessmentResultId"
         JOIN "CourseSpecAssessmentItem" a ON a."courseSpecId" = ar."courseSpecId" AND a.id = ar."assessmentItemId"
         JOIN "Rubric" r ON r.id = a."rubricId"
         CROSS JOIN LATERAL jsonb_array_elements(c."questionChanges") AS j(change)
         WHERE c.id = NULLIF(current_setting('dse.result_correction_id', true), '')
           AND c."assessmentResultId" = result_id AND r."instrumentKind" = 'marking_scheme'
           AND c.xmin::text::bigint = txid_current() % 4294967296
           AND j.change = jsonb_build_object('scoreId', OLD.id, 'criterionId', OLD."criterionId", 'criterionName', OLD."criterionName", 'rubricId', OLD."rubricId", 'rubricContentHash', OLD."rubricContentHash", 'beforeScore', OLD.score, 'afterScore', NEW.score, 'maxScore', OLD."maxScore")
       ) THEN
      RAISE EXCEPTION 'Finalized question marks require a matching new append-only correction record';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verify the entire scheme is still consistent at commit, including corrections
-- that redistribute marks between CLOs without changing the examination total.
CREATE FUNCTION "verify_marking_scheme_correction"()
RETURNS TRIGGER AS $$
DECLARE
  official RECORD;
  summed RECORD;
  changed JSONB;
BEGIN
  SELECT ar.*, r."instrumentKind" AS kind INTO official
  FROM "AssessmentResult" ar
  JOIN "CourseSpecAssessmentItem" a ON a."courseSpecId" = ar."courseSpecId" AND a.id = ar."assessmentItemId"
  LEFT JOIN "Rubric" r ON r.id = a."rubricId"
  WHERE ar.id = NEW."assessmentResultId";
  IF official.kind IS DISTINCT FROM 'marking_scheme' THEN
    IF jsonb_array_length(NEW."questionChanges") > 0 THEN RAISE EXCEPTION 'Question corrections require a marking scheme'; END IF;
    RETURN NEW;
  END IF;
  SELECT count(*) AS count, sum(score) AS score, sum("maxScore") AS maximum INTO summed
  FROM "AssessmentCriterionScore" WHERE "assessmentResultId" = official.id;
  IF official."finalizedAt" IS NULL OR official."publishedAt" IS NULL OR summed.count = 0
     OR abs(summed.score - official.score) > 0.000000001
     OR abs(summed.maximum - official."maxScore") > 0.000000001
     OR official.score IS DISTINCT FROM NEW."afterScore"
     OR official."maxScore" IS DISTINCT FROM NEW."afterMaxScore"
     OR official.feedback IS DISTINCT FROM NEW."afterFeedback"
     OR NEW."beforeMaxScore" IS DISTINCT FROM NEW."afterMaxScore"
     OR (NEW."beforeScore" IS DISTINCT FROM NEW."afterScore" AND jsonb_array_length(NEW."questionChanges") = 0)
  THEN RAISE EXCEPTION 'Marking scheme correction must preserve complete, consistent question totals'; END IF;
  FOR changed IN SELECT value FROM jsonb_array_elements(NEW."questionChanges") LOOP
    IF NOT EXISTS (
      SELECT 1 FROM "AssessmentCriterionScore" s
      WHERE s."assessmentResultId" = official.id AND s.id = changed->>'scoreId'
        AND s."criterionId" = changed->>'criterionId' AND s."rubricId" = changed->>'rubricId'
        AND s."rubricContentHash" = changed->>'rubricContentHash'
        AND s.score = (changed->>'afterScore')::double precision
        AND s."maxScore" = (changed->>'maxScore')::double precision
    ) THEN RAISE EXCEPTION 'Audited question change not applied'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "AssessmentResultCorrection_verify_scheme"
AFTER INSERT ON "AssessmentResultCorrection" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "verify_marking_scheme_correction"();
