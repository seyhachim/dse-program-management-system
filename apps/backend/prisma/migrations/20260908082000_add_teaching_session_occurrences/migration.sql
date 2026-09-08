CREATE TABLE "pms_attendance"."TeachingSessionOccurrence" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "offeringMeetingId" TEXT NOT NULL,
  "sessionDate" DATE NOT NULL,
  "scheduledDayOfWeek" TEXT NOT NULL,
  "scheduledStartTime" TEXT NOT NULL,
  "scheduledEndTime" TEXT NOT NULL,
  "scheduledRoom" TEXT,
  "scheduledActivityType" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeachingSessionOccurrence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeachingSessionOccurrence_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES "public"."Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionOccurrence_offeringMeetingId_fkey"
    FOREIGN KEY ("offeringMeetingId") REFERENCES "public"."OfferingMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TeachingSessionOccurrence_meeting_date_key"
  ON "pms_attendance"."TeachingSessionOccurrence"("offeringMeetingId", "sessionDate");
CREATE INDEX "TeachingSessionOccurrence_offering_date_idx"
  ON "pms_attendance"."TeachingSessionOccurrence"("offeringId", "sessionDate");

ALTER TABLE "pms_attendance"."TeachingSessionOccurrence" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionOccurrence" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionOccurrence" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionOccurrence" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionOccurrence" FROM service_role;
  END IF;
END
$$;

-- Existing arrival/session evidence remains intact. A nullable occurrence link lets
-- new exact-meeting workflows coexist with historical Offering+date rows.
ALTER TABLE "pms_attendance"."LecturerArrivalConfirmation"
  ADD COLUMN "occurrenceId" TEXT;
ALTER TABLE "pms_attendance"."LecturerArrivalConfirmation"
  ADD CONSTRAINT "LecturerArrivalConfirmation_occurrenceId_fkey"
  FOREIGN KEY ("occurrenceId") REFERENCES "pms_attendance"."TeachingSessionOccurrence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pms_attendance"."ClassSessionStatus"
  ADD COLUMN "occurrenceId" TEXT;
ALTER TABLE "pms_attendance"."ClassSessionStatus"
  ADD CONSTRAINT "ClassSessionStatus_occurrenceId_fkey"
  FOREIGN KEY ("occurrenceId") REFERENCES "pms_attendance"."TeachingSessionOccurrence"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Legacy rows stay unique by Offering+date. Exact occurrence-aware rows are
-- unique by occurrence, which permits multiple meetings for one Offering/date.
DROP INDEX "pms_attendance"."LecturerArrivalConfirmation_offeringId_date_key";
CREATE UNIQUE INDEX "LecturerArrivalConfirmation_legacy_offering_date_key"
  ON "pms_attendance"."LecturerArrivalConfirmation"("offeringId", "date")
  WHERE "occurrenceId" IS NULL;
CREATE UNIQUE INDEX "LecturerArrivalConfirmation_occurrenceId_key"
  ON "pms_attendance"."LecturerArrivalConfirmation"("occurrenceId")
  WHERE "occurrenceId" IS NOT NULL;

DROP INDEX "pms_attendance"."ClassSessionStatus_offeringId_date_key";
CREATE UNIQUE INDEX "ClassSessionStatus_legacy_offering_date_key"
  ON "pms_attendance"."ClassSessionStatus"("offeringId", "date")
  WHERE "occurrenceId" IS NULL;
CREATE UNIQUE INDEX "ClassSessionStatus_occurrenceId_key"
  ON "pms_attendance"."ClassSessionStatus"("occurrenceId")
  WHERE "occurrenceId" IS NOT NULL;
