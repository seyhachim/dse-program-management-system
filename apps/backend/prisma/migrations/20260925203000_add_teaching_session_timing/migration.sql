CREATE TABLE "pms_attendance"."TeachingSessionTiming" (
  "id" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ(3),
  "startedById" TEXT,
  "endedAt" TIMESTAMPTZ(3),
  "endedById" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeachingSessionTiming_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeachingSessionTiming_occurrenceId_key" UNIQUE ("occurrenceId"),
  CONSTRAINT "TeachingSessionTiming_occurrenceId_fkey"
    FOREIGN KEY ("occurrenceId") REFERENCES "pms_attendance"."TeachingSessionOccurrence"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionTiming_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES "public"."Offering"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionTiming_startedById_fkey"
    FOREIGN KEY ("startedById") REFERENCES "public"."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionTiming_endedById_fkey"
    FOREIGN KEY ("endedById") REFERENCES "public"."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionTiming_start_actor_check"
    CHECK (("startedAt" IS NULL) = ("startedById" IS NULL)),
  CONSTRAINT "TeachingSessionTiming_end_actor_check"
    CHECK (("endedAt" IS NULL) = ("endedById" IS NULL)),
  CONSTRAINT "TeachingSessionTiming_order_check"
    CHECK (
      "endedAt" IS NULL
      OR ("startedAt" IS NOT NULL AND "endedAt" > "startedAt")
    )
);

CREATE INDEX "TeachingSessionTiming_offering_idx"
  ON "pms_attendance"."TeachingSessionTiming"("offeringId", "createdAt");

ALTER TABLE "pms_attendance"."TeachingSessionTiming" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionTiming" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionTiming" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionTiming" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionTiming" FROM service_role;
  END IF;
END
$$;
