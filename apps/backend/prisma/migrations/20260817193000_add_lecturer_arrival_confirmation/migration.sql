CREATE TABLE "pms_attendance"."LecturerArrivalConfirmation" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LecturerArrivalConfirmation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LecturerArrivalConfirmation_status_check" CHECK ("status" IN ('Present', 'NotYet')),
  CONSTRAINT "LecturerArrivalConfirmation_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES "public"."Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LecturerArrivalConfirmation_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LecturerArrivalConfirmation_offeringId_date_key"
  ON "pms_attendance"."LecturerArrivalConfirmation"("offeringId", "date");
CREATE INDEX "LecturerArrivalConfirmation_recordedById_idx"
  ON "pms_attendance"."LecturerArrivalConfirmation"("recordedById");

ALTER TABLE "pms_attendance"."LecturerArrivalConfirmation" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "pms_attendance"."LecturerArrivalConfirmation" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "pms_attendance"."LecturerArrivalConfirmation" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "pms_attendance"."LecturerArrivalConfirmation" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "pms_attendance"."LecturerArrivalConfirmation" FROM service_role;
  END IF;
END
$$;
