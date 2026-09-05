-- Repair editable Course Specification snapshots created before the Course Team
-- lead was synchronized into Course.lecturerId. Historical submitted/reviewed/
-- approved versions remain untouched.
--
-- The CourseSpecResponsibleLecturer join is intentional: Course.lecturerId alone
-- is not enough evidence that the user is the lead of this exact CourseSpec.
WITH current_spec AS (
  SELECT DISTINCT ON (spec."courseId")
    spec."id",
    spec."courseId",
    spec."reviewStatus"
  FROM "CourseSpec" spec
  ORDER BY
    spec."courseId",
    spec."versionMajor" DESC,
    spec."versionMinor" DESC
)
UPDATE "CourseSpecCourseInfo" info
SET
  "instructorName" = lecturer."name",
  "instructorTitle" = COALESCE(lecturer."title", ''),
  "qualification" = COALESCE(lecturer."qualification", ''),
  "email" = lecturer."email",
  "telephone" = COALESCE(lecturer."phone", '')
FROM current_spec spec
INNER JOIN "Course" course
  ON course."id" = spec."courseId"
INNER JOIN "CourseSpecResponsibleLecturer" responsibility
  ON responsibility."courseSpecId" = spec."id"
  AND responsibility."lecturerId" = course."lecturerId"
INNER JOIN "User" lecturer
  ON lecturer."id" = course."lecturerId"
WHERE info."courseSpecId" = spec."id"
  AND spec."reviewStatus"::text IN ('Draft', 'ChangesRequested');
