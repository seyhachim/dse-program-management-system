-- Add nullable provenance so legacy published rows remain valid without inventing an actor.
ALTER TABLE "AssessmentResult"
  ADD COLUMN "publishedById" TEXT,
  ADD COLUMN "finalizedAt" TIMESTAMP(3),
  ADD COLUMN "finalizedById" TEXT;

CREATE INDEX "AssessmentResult_publishedById_idx"
  ON "AssessmentResult"("publishedById");
CREATE INDEX "AssessmentResult_finalizedAt_idx"
  ON "AssessmentResult"("finalizedAt");
CREATE INDEX "AssessmentResult_finalizedById_idx"
  ON "AssessmentResult"("finalizedById");

ALTER TABLE "AssessmentResult"
  ADD CONSTRAINT "AssessmentResult_publishedById_fkey"
  FOREIGN KEY ("publishedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AssessmentResult"
  ADD CONSTRAINT "AssessmentResult_finalizedById_fkey"
  FOREIGN KEY ("finalizedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
