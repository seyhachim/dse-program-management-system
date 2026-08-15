CREATE TABLE "CourseSpecCourseInfo" (
  "courseSpecId" TEXT NOT NULL,
  "courseCode" TEXT NOT NULL,
  "courseTitle" TEXT NOT NULL,
  "courseDescription" TEXT NOT NULL DEFAULT '',
  "credits" INTEGER,
  "courseType" "CourseType",
  "prerequisites" TEXT NOT NULL DEFAULT '',
  "totalSltHours" INTEGER,
  "lecturerName" TEXT NOT NULL DEFAULT '',
  "lecturerTitle" TEXT NOT NULL DEFAULT '',
  "lecturerQualification" TEXT NOT NULL DEFAULT '',
  "lecturerEmail" TEXT NOT NULL DEFAULT '',
  "lecturerPhone" TEXT NOT NULL DEFAULT '',
  "otherLecturers" TEXT NOT NULL DEFAULT '',
  "semester" "Semester",
  "programmeYear" INTEGER,
  "programmeCode" TEXT NOT NULL DEFAULT '',
  "programmeName" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSpecCourseInfo_pkey" PRIMARY KEY ("courseSpecId")
);

ALTER TABLE "CourseSpecCourseInfo"
ADD CONSTRAINT "CourseSpecCourseInfo_courseSpecId_fkey"
FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing version receives its own snapshot. The newest Offering is used
-- only for the initial backfill; subsequent live edits do not change this row.
INSERT INTO "CourseSpecCourseInfo" (
  "courseSpecId", "courseCode", "courseTitle", "courseDescription",
  "credits", "courseType", "prerequisites", "totalSltHours",
  "lecturerName", "lecturerTitle", "lecturerQualification", "lecturerEmail",
  "lecturerPhone", "otherLecturers", "semester", "programmeYear",
  "programmeCode", "programmeName"
)
SELECT
  cs."id",
  c."code",
  c."title",
  COALESCE(c."description", ''),
  c."credits",
  c."courseType",
  COALESCE(c."prerequisites", ''),
  c."totalSltHours",
  COALESCE(u."name", ''),
  COALESCE(u."title", ''),
  COALESCE(u."qualification", ''),
  COALESCE(u."email", ''),
  COALESCE(u."phone", ''),
  COALESCE(o."otherLecturers", ''),
  o."semester",
  o."programmeYear",
  COALESCE(p."code", ''),
  COALESCE(p."name", '')
FROM "CourseSpec" cs
JOIN "Course" c ON c."id" = cs."courseId"
LEFT JOIN "User" u ON u."id" = c."lecturerId"
LEFT JOIN "Programme" p ON p."id" = c."programmeId"
LEFT JOIN LATERAL (
  SELECT "otherLecturers", "semester", "programmeYear"
  FROM "Offering"
  WHERE "courseId" = c."id"
  ORDER BY "createdAt" DESC
  LIMIT 1
) o ON TRUE;
