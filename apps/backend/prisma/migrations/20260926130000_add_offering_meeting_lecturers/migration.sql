-- Explicit lecturer ownership for recurring weekly OfferingMeeting rows.
-- Existing meetings are intentionally NOT backfilled. A missing assignment means
-- the meeting is unallocated until programme staff explicitly save ownership.

CREATE TABLE "OfferingMeetingLecturer" (
  "meetingId" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferingMeetingLecturer_pkey" PRIMARY KEY ("meetingId", "lecturerId")
);

CREATE INDEX "OfferingMeetingLecturer_lecturerId_idx"
  ON "OfferingMeetingLecturer"("lecturerId");

ALTER TABLE "OfferingMeetingLecturer"
  ADD CONSTRAINT "OfferingMeetingLecturer_meetingId_fkey"
  FOREIGN KEY ("meetingId") REFERENCES "OfferingMeeting"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferingMeetingLecturer"
  ADD CONSTRAINT "OfferingMeetingLecturer_lecturerId_fkey"
  FOREIGN KEY ("lecturerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Follow the repository's fail-closed database-security convention for public
-- Prisma tables. Server-side Prisma remains the access boundary.
ALTER TABLE "OfferingMeetingLecturer" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "OfferingMeetingLecturer" FROM PUBLIC;

DO $meeting_lecturer_roles$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE "OfferingMeetingLecturer" FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$meeting_lecturer_roles$;
