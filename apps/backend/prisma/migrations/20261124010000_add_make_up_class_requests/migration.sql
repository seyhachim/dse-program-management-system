-- A make-up is a separate approved teaching date linked to an original occurrence.
-- Attendance retains its existing one-register-per-offering/date identity; active
-- make-ups therefore cannot share a date with another same-offering class.
CREATE TABLE "pms_attendance"."MakeUpClassRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offeringId" TEXT NOT NULL REFERENCES "public"."Offering"("id") ON DELETE RESTRICT,
  "originalOccurrenceId" TEXT NOT NULL REFERENCES "pms_attendance"."TeachingSessionOccurrence"("id") ON DELETE RESTRICT,
  "replacementDate" DATE NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "room" TEXT,
  "note" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPROVED','REJECTED')),
  "proposedById" TEXT NOT NULL REFERENCES "public"."User"("id") ON DELETE RESTRICT,
  "reviewedById" TEXT REFERENCES "public"."User"("id") ON DELETE RESTRICT,
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewNote" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MakeUpClassRequest_valid_times" CHECK ("startTime" < "endTime")
);
-- Only one active recovery for an original occurrence, and only one active
-- make-up register per offering/date. Rejected requests remain auditable.
CREATE UNIQUE INDEX "MakeUpClassRequest_active_original"
  ON "pms_attendance"."MakeUpClassRequest"("originalOccurrenceId")
  WHERE "status" IN ('PENDING','APPROVED');
CREATE UNIQUE INDEX "MakeUpClassRequest_active_offering_date"
  ON "pms_attendance"."MakeUpClassRequest"("offeringId","replacementDate")
  WHERE "status" IN ('PENDING','APPROVED');
CREATE INDEX "MakeUpClassRequest_status_date_idx"
  ON "pms_attendance"."MakeUpClassRequest"("status","replacementDate");
CREATE INDEX "MakeUpClassRequest_proposer_idx"
  ON "pms_attendance"."MakeUpClassRequest"("proposedById","createdAt");
ALTER TABLE "pms_attendance"."MakeUpClassRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pms_attendance"."MakeUpClassRequest" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE "pms_attendance"."MakeUpClassRequest" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE "pms_attendance"."MakeUpClassRequest" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    REVOKE ALL ON TABLE "pms_attendance"."MakeUpClassRequest" FROM service_role;
  END IF;
END $$;
