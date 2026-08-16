-- Issue #282: rubric-criterion student scoring and criterion-level CLO evidence.
-- Additive only: whole-assessment AssessmentResult and local grade weights are unchanged.
CREATE TABLE "CourseSpecCriterionCloMapping" (
  "courseSpecId" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "rubricId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "criterionName" TEXT NOT NULL,
  "rubricContentHash" TEXT NOT NULL,
  "cloCode" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSpecCriterionCloMapping_pkey" PRIMARY KEY ("courseSpecId", "assessmentItemId", "rubricId", "criterionId", "cloCode")
);
CREATE INDEX "CourseSpecCriterionCloMapping_courseSpecId_assessmentItemId_cloCode_idx" ON "CourseSpecCriterionCloMapping"("courseSpecId", "assessmentItemId", "cloCode");
CREATE INDEX "CourseSpecCriterionCloMapping_rubricId_criterionId_idx" ON "CourseSpecCriterionCloMapping"("rubricId", "criterionId");
ALTER TABLE "CourseSpecCriterionCloMapping" ADD CONSTRAINT "CourseSpecCriterionCloMapping_assessmentItem_fkey" FOREIGN KEY ("courseSpecId", "assessmentItemId") REFERENCES "CourseSpecAssessmentItem"("courseSpecId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssessmentCriterionScore" (
  "id" TEXT NOT NULL,
  "assessmentResultId" TEXT NOT NULL,
  "rubricId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "criterionName" TEXT NOT NULL,
  "rubricContentHash" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL,
  "rubricLevelId" TEXT,
  "rubricLevelLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentCriterionScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentCriterionScore_assessmentResultId_rubricId_criterionId_key" ON "AssessmentCriterionScore"("assessmentResultId", "rubricId", "criterionId");
CREATE INDEX "AssessmentCriterionScore_assessmentResultId_idx" ON "AssessmentCriterionScore"("assessmentResultId");
CREATE INDEX "AssessmentCriterionScore_rubricId_criterionId_idx" ON "AssessmentCriterionScore"("rubricId", "criterionId");
ALTER TABLE "AssessmentCriterionScore" ADD CONSTRAINT "AssessmentCriterionScore_assessmentResultId_fkey" FOREIGN KEY ("assessmentResultId") REFERENCES "AssessmentResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- These tables contain academic evidence and are intentionally backend-only.
-- Keep them out of Supabase Data API access and make the repository security
-- verifier fail closed if RLS protection is ever removed. No permissive policies
-- are created here.
ALTER TABLE "CourseSpecCriterionCloMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssessmentCriterionScore" ENABLE ROW LEVEL SECURITY;
