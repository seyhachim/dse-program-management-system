ALTER TABLE "CourseSpecAssessmentItem" ADD COLUMN "assessmentCategory" TEXT NOT NULL DEFAULT 'continuous';
ALTER TABLE "CourseSpecAssessmentItem" ADD COLUMN "topicNumbers" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "CourseSpecAssessmentItem" ADD COLUMN "physicalHours" DOUBLE PRECISION;
ALTER TABLE "CourseSpecAssessmentItem" ADD COLUMN "onlineHours" DOUBLE PRECISION;
ALTER TABLE "CourseSpecAssessmentItem" ADD COLUMN "independentHours" DOUBLE PRECISION;
ALTER TABLE "CourseSpec" ADD COLUMN "documentDate" TEXT NOT NULL DEFAULT '';
