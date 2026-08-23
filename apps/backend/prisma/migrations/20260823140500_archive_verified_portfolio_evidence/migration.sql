-- Issue #574 integrity follow-up: evidence with audit history is archived rather than
-- hard-deleted so append-only verification events remain traceable.
ALTER TABLE "StudentPortfolioEvidence"
  ADD COLUMN "archivedAt" TIMESTAMPTZ;

CREATE INDEX "StudentPortfolioEvidence_student_archived_idx"
  ON "StudentPortfolioEvidence"("studentId", "archivedAt");
