-- Issue #309: structured, queryable expert corrections tied to an immutable analysis review.
ALTER TABLE "QaEvidenceAnalysisReview"
  ADD COLUMN "correctedState" "QaEvidenceAnalysisState",
  ADD COLUMN "reasonCategory" TEXT NOT NULL DEFAULT 'confirmation',
  ADD COLUMN "reasonCode" TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN "correctedEvidenceCandidateKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "correctedRelationships" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX "QaEvidenceAnalysisReview_reasonCategory_reasonCode_idx"
  ON "QaEvidenceAnalysisReview" ("reasonCategory", "reasonCode");

CREATE OR REPLACE FUNCTION prevent_qa_analysis_review_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'QaEvidenceAnalysisReview is append-only; create a new review instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "QaEvidenceAnalysisReview_append_only"
BEFORE UPDATE OR DELETE ON "QaEvidenceAnalysisReview"
FOR EACH ROW EXECUTE FUNCTION prevent_qa_analysis_review_mutation();
