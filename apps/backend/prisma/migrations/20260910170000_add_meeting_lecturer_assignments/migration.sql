-- Meeting-level lecturer ownership for split/co-taught Course Offerings.
--
-- OfferingMeeting rows are currently replaced when an Offering timetable is
-- edited. Persist the recurring schedule signature rather than the transient
-- meeting id so an unchanged meeting keeps its assignment across that replace.
-- We deliberately do not backfill multi-lecturer offerings because historical
-- split ownership cannot be inferred safely. Single-lecturer offerings use a
-- read-time sole-lecturer default in the service instead of fabricating rows.

CREATE TABLE pms_attendance."OfferingMeetingLecturerAssignment" (
  "offeringId" TEXT NOT NULL,
  "dayOfWeek" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "activityType" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "assignedByUserId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferingMeetingLecturerAssignment_pkey"
    PRIMARY KEY ("offeringId", "dayOfWeek", "startTime", "endTime", "activityType", "lecturerId"),
  CONSTRAINT "OfferingMeetingLecturerAssignment_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES public."Offering"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OfferingMeetingLecturerAssignment_lecturerId_fkey"
    FOREIGN KEY ("lecturerId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingMeetingLecturerAssignment_assignedByUserId_fkey"
    FOREIGN KEY ("assignedByUserId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "OfferingMeetingLecturerAssignment_lecturerId_idx"
  ON pms_attendance."OfferingMeetingLecturerAssignment"("lecturerId");
CREATE INDEX "OfferingMeetingLecturerAssignment_offeringId_idx"
  ON pms_attendance."OfferingMeetingLecturerAssignment"("offeringId");

ALTER TABLE pms_attendance."OfferingMeetingLecturerAssignment" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON pms_attendance."OfferingMeetingLecturerAssignment" FROM PUBLIC;

DO $meeting_lecturer_roles$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE pms_attendance."OfferingMeetingLecturerAssignment" FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$meeting_lecturer_roles$;
