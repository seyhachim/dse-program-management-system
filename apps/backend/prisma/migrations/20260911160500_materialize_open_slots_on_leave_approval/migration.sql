CREATE OR REPLACE FUNCTION "pms_attendance"."materialize_open_teaching_slots_on_leave_approval"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW."status" = 'APPROVED' AND OLD."status" IS DISTINCT FROM 'APPROVED' THEN
    WITH inserted AS (
      INSERT INTO "pms_attendance"."OpenTeachingSlot"
        ("id","programmeId","sourceOccurrenceId","sourceLeaveRequestId","status","openedAt","updatedAt")
      SELECT
        occurrence."id",
        NEW."programmeId",
        occurrence."id",
        NEW."id",
        'OPEN',
        COALESCE(NEW."reviewedAt", CURRENT_TIMESTAMP),
        CURRENT_TIMESTAMP
      FROM "pms_attendance"."TeachingLeaveRequestOccurrence" link
      JOIN "pms_attendance"."TeachingSessionOccurrence" occurrence
        ON occurrence."id" = link."occurrenceId"
      WHERE link."requestId" = NEW."id"
        AND link."releaseForReuse" = TRUE
        AND occurrence."approvedLeaveRequestId" = NEW."id"
      ON CONFLICT ("sourceOccurrenceId") DO NOTHING
      RETURNING "id", "sourceOccurrenceId"
    )
    INSERT INTO "pms_attendance"."OpenTeachingSlotAuditEvent"
      ("id","slotId","actorId","action","previousStatus","newStatus","details","createdAt")
    SELECT
      'leave-approval-open-slot-' || inserted."id",
      inserted."id",
      COALESCE(NEW."reviewedById", NEW."requesterId"),
      'OPENED',
      NULL,
      'OPEN',
      jsonb_build_object('sourceOccurrenceId', inserted."sourceOccurrenceId", 'leaveApproval', TRUE),
      COALESCE(NEW."reviewedAt", CURRENT_TIMESTAMP)
    FROM inserted
    ON CONFLICT ("id") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "TeachingLeaveRequest_materialize_open_slots_after_approval"
AFTER UPDATE OF "status" ON "pms_attendance"."TeachingLeaveRequest"
FOR EACH ROW
EXECUTE FUNCTION "pms_attendance"."materialize_open_teaching_slots_on_leave_approval"();

REVOKE ALL ON FUNCTION "pms_attendance"."materialize_open_teaching_slots_on_leave_approval"() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION "pms_attendance"."materialize_open_teaching_slots_on_leave_approval"() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION "pms_attendance"."materialize_open_teaching_slots_on_leave_approval"() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON FUNCTION "pms_attendance"."materialize_open_teaching_slots_on_leave_approval"() FROM service_role;
  END IF;
END
$$;
