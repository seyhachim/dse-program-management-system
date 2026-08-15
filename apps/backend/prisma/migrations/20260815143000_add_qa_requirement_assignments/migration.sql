-- Issue #226: cycle-scoped ownership for AUN-QA requirement work.
-- This table only records who owns SAR/QA work. It does not mutate catalogue,
-- evidence-analysis, evidence, or human self-assessment state.

CREATE TABLE "QaRequirementAssignment" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QaRequirementAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QaRequirementAssignment_cycleId_requirementId_key"
  ON "QaRequirementAssignment"("cycleId", "requirementId");
CREATE INDEX "QaRequirementAssignment_programmeId_cycleId_idx"
  ON "QaRequirementAssignment"("programmeId", "cycleId");
CREATE INDEX "QaRequirementAssignment_cycleId_assigneeId_idx"
  ON "QaRequirementAssignment"("cycleId", "assigneeId");
CREATE INDEX "QaRequirementAssignment_assignedById_idx"
  ON "QaRequirementAssignment"("assignedById");

ALTER TABLE "QaRequirementAssignment"
  ADD CONSTRAINT "QaRequirementAssignment_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaRequirementAssignment"
  ADD CONSTRAINT "QaRequirementAssignment_cycleId_fkey"
  FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QaRequirementAssignment"
  ADD CONSTRAINT "QaRequirementAssignment_requirementId_fkey"
  FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaRequirementAssignment"
  ADD CONSTRAINT "QaRequirementAssignment_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaRequirementAssignment"
  ADD CONSTRAINT "QaRequirementAssignment_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QaRequirementAssignment" ENABLE ROW LEVEL SECURITY;
