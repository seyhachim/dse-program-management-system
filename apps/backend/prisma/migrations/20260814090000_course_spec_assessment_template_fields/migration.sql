ALTER TABLE "CourseSpecAssessmentItem"
  ADD COLUMN IF NOT EXISTS "assessmentCategory" TEXT NOT NULL DEFAULT 'continuous',
  ADD COLUMN IF NOT EXISTS "topicNumbers" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD COLUMN IF NOT EXISTS "physicalSltHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "onlineSltHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "independentSltHours" DOUBLE PRECISION;

ALTER TABLE "CourseSpecAssessmentItem"
  ADD CONSTRAINT "CourseSpecAssessmentItem_assessmentCategory_check"
  CHECK ("assessmentCategory" IN ('continuous', 'final'));

ALTER TABLE "CourseSpecAssessmentItem"
  ADD CONSTRAINT "CourseSpecAssessmentItem_topicNumbers_check"
  CHECK (
    "topicNumbers" <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]::INTEGER[]
  );

ALTER TABLE "CourseSpecAssessmentItem"
  ADD CONSTRAINT "CourseSpecAssessmentItem_physicalSltHours_check"
  CHECK ("physicalSltHours" IS NULL OR "physicalSltHours" >= 0);

ALTER TABLE "CourseSpecAssessmentItem"
  ADD CONSTRAINT "CourseSpecAssessmentItem_onlineSltHours_check"
  CHECK ("onlineSltHours" IS NULL OR "onlineSltHours" >= 0);

ALTER TABLE "CourseSpecAssessmentItem"
  ADD CONSTRAINT "CourseSpecAssessmentItem_independentSltHours_check"
  CHECK ("independentSltHours" IS NULL OR "independentSltHours" >= 0);
