CREATE TABLE "CourseSpecResponsibleLecturer" (
    "courseSpecId" TEXT NOT NULL,
    "lecturerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSpecResponsibleLecturer_pkey" PRIMARY KEY ("courseSpecId","lecturerId")
);

CREATE INDEX "CourseSpecResponsibleLecturer_lecturerId_idx"
ON "CourseSpecResponsibleLecturer"("lecturerId");

ALTER TABLE "CourseSpecResponsibleLecturer"
ADD CONSTRAINT "CourseSpecResponsibleLecturer_courseSpecId_fkey"
FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseSpecResponsibleLecturer"
ADD CONSTRAINT "CourseSpecResponsibleLecturer_lecturerId_fkey"
FOREIGN KEY ("lecturerId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- The backend connects with the database owner/service connection. RLS therefore
-- provides deny-by-default protection from Data API roles, consistent with the
-- rest of the PMS public-schema security baseline.
ALTER TABLE "CourseSpecResponsibleLecturer" ENABLE ROW LEVEL SECURITY;

-- Revisions inherit the exact responsible team from their approved source version.
-- This is deliberately version-scoped: subsequent edits affect only the new Draft.
CREATE OR REPLACE FUNCTION "copy_course_spec_responsible_lecturers"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."basedOnVersionId" IS NOT NULL THEN
    INSERT INTO "CourseSpecResponsibleLecturer" ("courseSpecId", "lecturerId")
    SELECT NEW."id", source."lecturerId"
    FROM "CourseSpecResponsibleLecturer" source
    WHERE source."courseSpecId" = NEW."basedOnVersionId"
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CourseSpec_copy_responsible_lecturers"
AFTER INSERT ON "CourseSpec"
FOR EACH ROW
EXECUTE FUNCTION "copy_course_spec_responsible_lecturers"();
