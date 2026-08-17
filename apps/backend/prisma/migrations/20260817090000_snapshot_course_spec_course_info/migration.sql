-- Issue #207: freeze Course Information per academic CourseSpec version.
-- Historical documents must not change when Course, User, or Offering rows change.

CREATE TABLE "CourseSpecCourseInfo" (
  "courseSpecId" TEXT NOT NULL,
  "programmeTitle" TEXT NOT NULL,
  "courseTitle" TEXT NOT NULL,
  "courseCode" TEXT NOT NULL,
  "credits" INTEGER,
  "prerequisites" TEXT NOT NULL DEFAULT '',
  "courseType" "CourseType",
  "description" TEXT NOT NULL DEFAULT '',
  "totalSltHours" INTEGER,
  "instructorName" TEXT NOT NULL DEFAULT '',
  "instructorTitle" TEXT NOT NULL DEFAULT '',
  "qualification" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "telephone" TEXT NOT NULL DEFAULT '',
  "otherLecturers" TEXT NOT NULL DEFAULT '',
  "semester" "Semester",
  "programmeYear" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSpecCourseInfo_pkey" PRIMARY KEY ("courseSpecId")
);

ALTER TABLE "CourseSpecCourseInfo"
  ADD CONSTRAINT "CourseSpecCourseInfo_courseSpecId_fkey"
  FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing versions receive a best-available one-time snapshot. The latest
-- Offering follows the same precedence the old live read model used.
INSERT INTO "CourseSpecCourseInfo" (
  "courseSpecId", "programmeTitle", "courseTitle", "courseCode", "credits",
  "prerequisites", "courseType", "description", "totalSltHours",
  "instructorName", "instructorTitle", "qualification", "email", "telephone",
  "otherLecturers", "semester", "programmeYear"
)
SELECT
  cs."id",
  'Bachelor of Engineering in Data Science and Engineering',
  c."title",
  c."code",
  c."credits",
  COALESCE(c."prerequisites", ''),
  c."courseType",
  COALESCE(c."description", ''),
  c."totalSltHours",
  COALESCE(u."name", ''),
  COALESCE(u."title", ''),
  COALESCE(u."qualification", ''),
  COALESCE(u."email", ''),
  COALESCE(u."phone", ''),
  COALESCE(o."otherLecturers", ''),
  o."semester",
  o."programmeYear"
FROM "CourseSpec" cs
JOIN "Course" c ON c."id" = cs."courseId"
LEFT JOIN "User" u ON u."id" = c."lecturerId"
LEFT JOIN LATERAL (
  SELECT ofr."otherLecturers", ofr."semester", ofr."programmeYear"
  FROM "Offering" ofr
  WHERE ofr."courseId" = c."id"
  ORDER BY ofr."createdAt" DESC, ofr."id" DESC
  LIMIT 1
) o ON TRUE;

-- An approved snapshot is academic history. Application locks already prevent
-- normal edits; this DB guard prevents accidental direct/ future-code mutation.
CREATE OR REPLACE FUNCTION "protect_approved_course_spec_course_info"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "CourseSpec"
    WHERE "id" = OLD."courseSpecId" AND "reviewStatus" = 'Approved'
  ) THEN
    RAISE EXCEPTION 'Approved CourseSpec Course Information snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CourseSpecCourseInfo_protect_approved"
BEFORE UPDATE ON "CourseSpecCourseInfo"
FOR EACH ROW EXECUTE FUNCTION "protect_approved_course_spec_course_info"();

ALTER TABLE "CourseSpecCourseInfo" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "CourseSpecCourseInfo" FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
      'public', 'CourseSpecCourseInfo', api_role
    );
  END LOOP;
END
$$;
