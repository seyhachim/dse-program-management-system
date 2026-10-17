-- #1270: separate lecturer-only, semester-long student observations from attendance evidence.
-- Additive only: no existing students, enrollments, attendance or QA rows are touched.
CREATE TABLE "OfferingStudentSemesterNote" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "note" VARCHAR(1000) NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfferingStudentSemesterNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferingStudentSemesterNote_version_positive" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "OfferingStudentSemesterNote_offeringId_studentId_key"
  ON "OfferingStudentSemesterNote"("offeringId", "studentId");
CREATE INDEX "OfferingStudentSemesterNote_studentId_idx" ON "OfferingStudentSemesterNote"("studentId");
CREATE INDEX "OfferingStudentSemesterNote_updatedById_idx" ON "OfferingStudentSemesterNote"("updatedById");

ALTER TABLE "OfferingStudentSemesterNote"
  ADD CONSTRAINT "OfferingStudentSemesterNote_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfferingStudentSemesterNote"
  ADD CONSTRAINT "OfferingStudentSemesterNote_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfferingStudentSemesterNote"
  ADD CONSTRAINT "OfferingStudentSemesterNote_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OfferingStudentSemesterNoteRevision" (
  "id" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "previousNote" VARCHAR(1000) NOT NULL,
  "nextNote" VARCHAR(1000) NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfferingStudentSemesterNoteRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferingStudentSemesterNoteRevision_version_positive" CHECK ("version" > 0),
  CONSTRAINT "OfferingStudentSemesterNoteRevision_changed" CHECK ("previousNote" <> "nextNote")
);

CREATE UNIQUE INDEX "OfferingStudentSemesterNoteRevision_noteId_version_key"
  ON "OfferingStudentSemesterNoteRevision"("noteId", "version");
CREATE INDEX "OfferingStudentSemesterNoteRevision_actorId_idx"
  ON "OfferingStudentSemesterNoteRevision"("actorId");

ALTER TABLE "OfferingStudentSemesterNoteRevision"
  ADD CONSTRAINT "OfferingStudentSemesterNoteRevision_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "OfferingStudentSemesterNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OfferingStudentSemesterNoteRevision"
  ADD CONSTRAINT "OfferingStudentSemesterNoteRevision_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prevent out-of-band changes from tampering with recorded note revisions.
CREATE OR REPLACE FUNCTION "protect_offering_student_semester_note_revision"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Student semester note revision history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OfferingStudentSemesterNoteRevision_append_only"
BEFORE UPDATE OR DELETE ON "OfferingStudentSemesterNoteRevision"
FOR EACH ROW EXECUTE FUNCTION "protect_offering_student_semester_note_revision"();

-- These are private backend tables. Supabase Data API gets no access.
ALTER TABLE "OfferingStudentSemesterNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OfferingStudentSemesterNoteRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "OfferingStudentSemesterNote" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "OfferingStudentSemesterNoteRevision" FROM PUBLIC;

DO $revoke_roles$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
      'OfferingStudentSemesterNote', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
      'OfferingStudentSemesterNoteRevision', api_role);
  END LOOP;
END;
$revoke_roles$;
