-- Optional Project-Based Learning progress attached to a Weekly Plan row.
-- This table deliberately references CourseSpec only, not CourseSpecWeek, because
-- Weekly Plan saves rebuild CourseSpecWeek rows. weekId remains the stable client id.
CREATE TABLE "CourseSpecWeekProjectProgress" (
    "courseSpecId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL DEFAULT '',
    "expectedProgress" TEXT NOT NULL DEFAULT '',
    "deliverable" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSpecWeekProjectProgress_pkey" PRIMARY KEY ("courseSpecId", "weekId")
);

ALTER TABLE "CourseSpecWeekProjectProgress"
ADD CONSTRAINT "CourseSpecWeekProjectProgress_courseSpecId_fkey"
FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
