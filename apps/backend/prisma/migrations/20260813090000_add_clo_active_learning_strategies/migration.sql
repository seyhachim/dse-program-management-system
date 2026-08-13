ALTER TABLE "CourseSpecClo"
ADD COLUMN "activeLearningStrategyIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
