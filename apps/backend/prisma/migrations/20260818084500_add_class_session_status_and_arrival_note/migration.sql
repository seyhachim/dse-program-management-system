ALTER TABLE "pms_attendance"."LecturerArrivalConfirmation"
  ADD COLUMN "note" TEXT NOT NULL DEFAULT '';

ALTER TABLE "pms_attendance"."LecturerArrivalConfirmation"
  ADD CONSTRAINT "LecturerArrivalConfirmation_note_length_check"
  CHECK (char_length("note") <= 500);

CREATE TABLE "pms_attendance"."ClassSessionStatus" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClassSessionStatus_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassSessionStatus_status_check"
    CHECK ("status" IN ('Scheduled', 'Holiday', 'Cancelled', 'Rescheduled', 'Other')),
  CONSTRAINT "ClassSessionStatus_reason_length_check"
    CHECK (char_length("reason") <= 500),
  CONSTRAINT "ClassSessionStatus_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES "public"."Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassSessionStatus_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClassSessionStatus_offeringId_date_key"
  ON "pms_attendance"."ClassSessionStatus"("offeringId", "date");
CREATE INDEX "ClassSessionStatus_recordedById_idx"
  ON "pms_attendance"."ClassSessionStatus"("recordedById");
CREATE INDEX "ClassSessionStatus_status_date_idx"
  ON "pms_attendance"."ClassSessionStatus"("status", "date");

ALTER TABLE "pms_attendance"."ClassSessionStatus" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "pms_attendance"."ClassSessionStatus" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "pms_attendance"."ClassSessionStatus" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "pms_attendance"."ClassSessionStatus" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "pms_attendance"."ClassSessionStatus" FROM service_role;
  END IF;
END
$$;
