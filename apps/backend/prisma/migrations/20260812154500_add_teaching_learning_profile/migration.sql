-- Course-level Teaching & Learning strategy for issue #137.
-- Kept in its own normalized one-to-one table; concrete course resources remain
-- in CourseSpecResource and weekly execution remains in CourseSpecWeek.
CREATE TABLE "CourseSpecTeachingLearning" (
    "courseSpecId" TEXT NOT NULL,
    "philosophyTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "philosophyStatement" TEXT NOT NULL DEFAULT '',
    "teachingMethodIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "activeLearningStrategyIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "independentLearningTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resourceTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "technologyTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSpecTeachingLearning_pkey" PRIMARY KEY ("courseSpecId")
);

ALTER TABLE "CourseSpecTeachingLearning"
ADD CONSTRAINT "CourseSpecTeachingLearning_courseSpecId_fkey"
FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
