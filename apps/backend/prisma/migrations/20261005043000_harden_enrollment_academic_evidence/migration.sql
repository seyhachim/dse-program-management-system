-- Issue #1243: fail closed before Enrollment removal/reassignment can discard
-- academic evidence, and add append-only provenance for controlled section corrections.

CREATE TABLE "EnrollmentPlacementCorrection" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "fromOfferingId" TEXT NOT NULL,
  "toOfferingId" TEXT NOT NULL,
  "correctedById" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrollmentPlacementCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnrollmentPlacementCorrection_reason_not_blank" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "EnrollmentPlacementCorrection_offerings_distinct" CHECK ("fromOfferingId" <> "toOfferingId")
);

CREATE INDEX "EnrollmentPlacementCorrection_enrollmentId_createdAt_idx"
  ON "EnrollmentPlacementCorrection"("enrollmentId", "createdAt");
CREATE INDEX "EnrollmentPlacementCorrection_studentId_idx"
  ON "EnrollmentPlacementCorrection"("studentId");
CREATE INDEX "EnrollmentPlacementCorrection_fromOfferingId_idx"
  ON "EnrollmentPlacementCorrection"("fromOfferingId");
CREATE INDEX "EnrollmentPlacementCorrection_toOfferingId_idx"
  ON "EnrollmentPlacementCorrection"("toOfferingId");
CREATE INDEX "EnrollmentPlacementCorrection_correctedById_idx"
  ON "EnrollmentPlacementCorrection"("correctedById");

ALTER TABLE "EnrollmentPlacementCorrection"
  ADD CONSTRAINT "EnrollmentPlacementCorrection_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnrollmentPlacementCorrection"
  ADD CONSTRAINT "EnrollmentPlacementCorrection_fromOfferingId_fkey"
  FOREIGN KEY ("fromOfferingId") REFERENCES "Offering"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnrollmentPlacementCorrection"
  ADD CONSTRAINT "EnrollmentPlacementCorrection_toOfferingId_fkey"
  FOREIGN KEY ("toOfferingId") REFERENCES "Offering"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnrollmentPlacementCorrection"
  ADD CONSTRAINT "EnrollmentPlacementCorrection_correctedById_fkey"
  FOREIGN KEY ("correctedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_enrollment_placement_correction_history"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Enrollment placement correction history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EnrollmentPlacementCorrection_append_only"
BEFORE UPDATE OR DELETE ON "EnrollmentPlacementCorrection"
FOR EACH ROW
EXECUTE FUNCTION "protect_enrollment_placement_correction_history"();

CREATE OR REPLACE FUNCTION "protect_enrollment_academic_evidence"()
RETURNS TRIGGER AS $$
DECLARE
  identity_change BOOLEAN;
  source_completed BOOLEAN;
  target_completed BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    identity_change := TRUE;
  ELSE
    IF NEW."studentId" IS DISTINCT FROM OLD."studentId" THEN
      RAISE EXCEPTION 'Enrollment student identity cannot be reassigned';
    END IF;
    identity_change := NEW."offeringId" IS DISTINCT FROM OLD."offeringId";
  END IF;

  IF NOT identity_change THEN
    RETURN NEW;
  END IF;

  SELECT ("status" = 'Completed') INTO source_completed
  FROM "Offering"
  WHERE "id" = OLD."offeringId";

  IF source_completed THEN
    RAISE EXCEPTION 'Completed offering enrollment history cannot be removed or reassigned';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."offeringId" IS DISTINCT FROM OLD."offeringId" THEN
    SELECT ("status" = 'Completed') INTO target_completed
    FROM "Offering"
    WHERE "id" = NEW."offeringId";

    IF target_completed THEN
      RAISE EXCEPTION 'Students cannot be reassigned into a completed offering';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "Offering" source
      JOIN "Offering" target ON target."id" = NEW."offeringId"
      WHERE source."id" = OLD."offeringId"
        AND source."courseId" = target."courseId"
        AND source."courseSpecId" IS NOT DISTINCT FROM target."courseSpecId"
        AND source."term" = target."term"
        AND source."semester" IS NOT DISTINCT FROM target."semester"
        AND source."programmeYear" IS NOT DISTINCT FROM target."programmeYear"
        AND source."academicCalendarPeriodId" IS NOT DISTINCT FROM target."academicCalendarPeriodId"
        AND source."sectionCode" IS DISTINCT FROM target."sectionCode"
    )
    THEN
      RAISE EXCEPTION 'Enrollment placement correction must stay in the same academic context and change section';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "EnrollmentPlacementCorrection" correction
      WHERE correction."id" = NULLIF(current_setting('dse.enrollment_placement_correction_id', true), '')
        AND correction."enrollmentId" = OLD."id"
        AND correction."studentId" = OLD."studentId"
        AND correction."fromOfferingId" = OLD."offeringId"
        AND correction."toOfferingId" = NEW."offeringId"
    )
    THEN
      RAISE EXCEPTION 'Enrollment placement correction requires matching append-only audit provenance';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM "AssessmentResult"
    WHERE "enrollmentId" = OLD."id"
  )
  OR EXISTS (
    SELECT 1 FROM "AssessmentGroupMember"
    WHERE "enrollmentId" = OLD."id"
  )
  OR EXISTS (
    SELECT 1 FROM "AssessmentIndividualComponent"
    WHERE "enrollmentId" = OLD."id"
  )
  OR EXISTS (
    SELECT 1 FROM "AssessmentGroupAuditEvent"
    WHERE "enrollmentId" = OLD."id"
  )
  THEN
    RAISE EXCEPTION 'Enrollment cannot be removed or reassigned because assessment evidence exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "pms_attendance"."AttendanceSession" session
    WHERE session."offeringId" = OLD."offeringId"
      AND (
        EXISTS (
          SELECT 1 FROM "pms_attendance"."AttendanceRecord" record
          WHERE record."sessionId" = session."id"
            AND record."studentId" = OLD."studentId"
        )
        OR EXISTS (
          SELECT 1 FROM "pms_attendance"."AttendancePermissionPending" pending
          WHERE pending."sessionId" = session."id"
            AND pending."studentId" = OLD."studentId"
        )
        OR EXISTS (
          SELECT 1 FROM "pms_attendance"."AttendanceCheckpoint" checkpoint
          WHERE checkpoint."sessionId" = session."id"
            AND checkpoint."studentId" = OLD."studentId"
        )
      )
  )
  THEN
    RAISE EXCEPTION 'Enrollment cannot be removed or reassigned because attendance evidence exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "ClassResponsibilityAssignment"
    WHERE "offeringId" = OLD."offeringId"
      AND "studentId" = OLD."studentId"
      AND "revokedAt" IS NULL
  )
  THEN
    RAISE EXCEPTION 'Enrollment cannot be removed or reassigned while class responsibility is active';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Enrollment_protect_academic_evidence"
BEFORE UPDATE OR DELETE ON "Enrollment"
FOR EACH ROW
EXECUTE FUNCTION "protect_enrollment_academic_evidence"();

-- Backend-only audit history. Data API roles receive no permissive policy.
ALTER TABLE "EnrollmentPlacementCorrection" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "EnrollmentPlacementCorrection" FROM PUBLIC;

DO $
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon','authenticated','service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
      'EnrollmentPlacementCorrection',
      api_role
    );
  END LOOP;
END $;
