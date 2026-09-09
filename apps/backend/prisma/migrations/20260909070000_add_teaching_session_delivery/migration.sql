CREATE TABLE "pms_attendance"."TeachingSessionDelivery" (
  "id" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "classOccurred" BOOLEAN NOT NULL,
  "actualLecturerId" TEXT,
  "actualStartTime" TEXT,
  "actualEndTime" TEXT,
  "deliveredMinutes" INTEGER NOT NULL DEFAULT 0,
  "actualTopic" TEXT NOT NULL DEFAULT '',
  "coverage" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "plannedCourseSpecId" TEXT,
  "plannedWeekId" TEXT,
  "plannedWeekNumber" INTEGER,
  "plannedTopic" TEXT NOT NULL DEFAULT '',
  "recordedById" TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revision" INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "TeachingSessionDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeachingSessionDelivery_occurrenceId_key" UNIQUE ("occurrenceId"),
  CONSTRAINT "TeachingSessionDelivery_occurrenceId_fkey"
    FOREIGN KEY ("occurrenceId") REFERENCES "pms_attendance"."TeachingSessionOccurrence"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDelivery_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES "public"."Offering"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDelivery_actualLecturerId_fkey"
    FOREIGN KEY ("actualLecturerId") REFERENCES "public"."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDelivery_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "public"."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDelivery_plannedCourseSpecId_fkey"
    FOREIGN KEY ("plannedCourseSpecId") REFERENCES "public"."CourseSpec"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDelivery_plannedWeek_fkey"
    FOREIGN KEY ("plannedCourseSpecId", "plannedWeekId")
    REFERENCES "public"."CourseSpecWeek"("courseSpecId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDelivery_coverage_check"
    CHECK ("coverage" IN ('TAUGHT_AS_PLANNED', 'PARTIALLY_COVERED', 'DIFFERENT_TOPIC', 'NOT_COVERED')),
  CONSTRAINT "TeachingSessionDelivery_topic_length_check"
    CHECK (char_length("actualTopic") <= 1000),
  CONSTRAINT "TeachingSessionDelivery_note_length_check"
    CHECK (char_length("note") <= 500),
  CONSTRAINT "TeachingSessionDelivery_revision_check"
    CHECK ("revision" >= 1),
  CONSTRAINT "TeachingSessionDelivery_planned_week_check"
    CHECK ("plannedWeekNumber" IS NULL OR "plannedWeekNumber" >= 1),
  CONSTRAINT "TeachingSessionDelivery_actual_time_format_check"
    CHECK (
      ("actualStartTime" IS NULL OR "actualStartTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
      AND
      ("actualEndTime" IS NULL OR "actualEndTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    ),
  CONSTRAINT "TeachingSessionDelivery_occurrence_state_check"
    CHECK (
      (
        "classOccurred" = TRUE
        AND "actualLecturerId" IS NOT NULL
        AND "actualStartTime" IS NOT NULL
        AND "actualEndTime" IS NOT NULL
        AND "actualEndTime" > "actualStartTime"
        AND "deliveredMinutes" > 0
        AND "deliveredMinutes" <= 1440
      )
      OR
      (
        "classOccurred" = FALSE
        AND "actualLecturerId" IS NULL
        AND "actualStartTime" IS NULL
        AND "actualEndTime" IS NULL
        AND "deliveredMinutes" = 0
        AND "coverage" = 'NOT_COVERED'
      )
    )
);

CREATE INDEX "TeachingSessionDelivery_offering_idx"
  ON "pms_attendance"."TeachingSessionDelivery"("offeringId", "recordedAt");
CREATE INDEX "TeachingSessionDelivery_planned_week_idx"
  ON "pms_attendance"."TeachingSessionDelivery"("plannedCourseSpecId", "plannedWeekId");

CREATE TABLE "pms_attendance"."TeachingSessionDeliveryAuditEvent" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "previousSnapshot" JSONB,
  "newSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeachingSessionDeliveryAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeachingSessionDeliveryAuditEvent_delivery_revision_key" UNIQUE ("deliveryId", "revision"),
  CONSTRAINT "TeachingSessionDeliveryAuditEvent_deliveryId_fkey"
    FOREIGN KEY ("deliveryId") REFERENCES "pms_attendance"."TeachingSessionDelivery"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDeliveryAuditEvent_occurrenceId_fkey"
    FOREIGN KEY ("occurrenceId") REFERENCES "pms_attendance"."TeachingSessionOccurrence"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDeliveryAuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "public"."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingSessionDeliveryAuditEvent_revision_check"
    CHECK ("revision" >= 1)
);

CREATE INDEX "TeachingSessionDeliveryAuditEvent_occurrence_idx"
  ON "pms_attendance"."TeachingSessionDeliveryAuditEvent"("occurrenceId", "revision");
CREATE INDEX "TeachingSessionDeliveryAuditEvent_actor_idx"
  ON "pms_attendance"."TeachingSessionDeliveryAuditEvent"("actorId", "createdAt");

CREATE OR REPLACE FUNCTION "pms_attendance"."reject_teaching_session_delivery_audit_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TeachingSessionDeliveryAuditEvent is append-only';
END;
$$;

CREATE TRIGGER "TeachingSessionDeliveryAuditEvent_reject_update"
BEFORE UPDATE ON "pms_attendance"."TeachingSessionDeliveryAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "pms_attendance"."reject_teaching_session_delivery_audit_mutation"();

CREATE TRIGGER "TeachingSessionDeliveryAuditEvent_reject_delete"
BEFORE DELETE ON "pms_attendance"."TeachingSessionDeliveryAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "pms_attendance"."reject_teaching_session_delivery_audit_mutation"();

ALTER TABLE "pms_attendance"."TeachingSessionDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pms_attendance"."TeachingSessionDeliveryAuditEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDelivery" FROM PUBLIC;
REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDeliveryAuditEvent" FROM PUBLIC;
REVOKE ALL ON FUNCTION "pms_attendance"."reject_teaching_session_delivery_audit_mutation"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDelivery" FROM anon;
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDeliveryAuditEvent" FROM anon;
    REVOKE ALL ON FUNCTION "pms_attendance"."reject_teaching_session_delivery_audit_mutation"() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDelivery" FROM authenticated;
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDeliveryAuditEvent" FROM authenticated;
    REVOKE ALL ON FUNCTION "pms_attendance"."reject_teaching_session_delivery_audit_mutation"() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDelivery" FROM service_role;
    REVOKE ALL ON TABLE "pms_attendance"."TeachingSessionDeliveryAuditEvent" FROM service_role;
    REVOKE ALL ON FUNCTION "pms_attendance"."reject_teaching_session_delivery_audit_mutation"() FROM service_role;
  END IF;
END
$$;
