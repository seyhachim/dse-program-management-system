CREATE TABLE "pms_attendance"."OpenTeachingSlot" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "sourceOccurrenceId" TEXT NOT NULL,
  "sourceLeaveRequestId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedAt" TIMESTAMPTZ(3),
  "closedAt" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OpenTeachingSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpenTeachingSlot_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "public"."Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlot_sourceOccurrenceId_fkey"
    FOREIGN KEY ("sourceOccurrenceId") REFERENCES "pms_attendance"."TeachingSessionOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlot_sourceLeaveRequestId_fkey"
    FOREIGN KEY ("sourceLeaveRequestId") REFERENCES "pms_attendance"."TeachingLeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlot_status_check"
    CHECK ("status" IN ('OPEN','CLAIM_REQUESTED','ASSIGNED','CLOSED','EXPIRED'))
);
CREATE UNIQUE INDEX "OpenTeachingSlot_sourceOccurrence_key"
  ON "pms_attendance"."OpenTeachingSlot"("sourceOccurrenceId");
CREATE INDEX "OpenTeachingSlot_programme_status_idx"
  ON "pms_attendance"."OpenTeachingSlot"("programmeId", "status", "openedAt");

CREATE TABLE "pms_attendance"."OpenTeachingSlotClaim" (
  "id" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "claimantId" TEXT NOT NULL,
  "targetOfferingId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewComment" TEXT NOT NULL DEFAULT '',
  "confirmedOccurrenceId" TEXT,
  "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OpenTeachingSlotClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpenTeachingSlotClaim_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "pms_attendance"."OpenTeachingSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlotClaim_claimantId_fkey"
    FOREIGN KEY ("claimantId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlotClaim_targetOfferingId_fkey"
    FOREIGN KEY ("targetOfferingId") REFERENCES "public"."Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlotClaim_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlotClaim_confirmedOccurrenceId_fkey"
    FOREIGN KEY ("confirmedOccurrenceId") REFERENCES "pms_attendance"."TeachingSessionOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlotClaim_status_check"
    CHECK ("status" IN ('REQUESTED','APPROVED','REJECTED','WITHDRAWN')),
  CONSTRAINT "OpenTeachingSlotClaim_review_comment_length_check"
    CHECK (char_length("reviewComment") <= 1500)
);
CREATE INDEX "OpenTeachingSlotClaim_slot_idx"
  ON "pms_attendance"."OpenTeachingSlotClaim"("slotId", "requestedAt");
CREATE INDEX "OpenTeachingSlotClaim_claimant_idx"
  ON "pms_attendance"."OpenTeachingSlotClaim"("claimantId", "requestedAt" DESC);
CREATE UNIQUE INDEX "OpenTeachingSlotClaim_active_slot_key"
  ON "pms_attendance"."OpenTeachingSlotClaim"("slotId")
  WHERE "status" IN ('REQUESTED','APPROVED');
CREATE UNIQUE INDEX "OpenTeachingSlotClaim_confirmed_occurrence_key"
  ON "pms_attendance"."OpenTeachingSlotClaim"("confirmedOccurrenceId")
  WHERE "confirmedOccurrenceId" IS NOT NULL;

ALTER TABLE "pms_attendance"."TeachingSessionOccurrence"
  ADD COLUMN "sourceOpenTeachingSlotId" TEXT;
ALTER TABLE "pms_attendance"."TeachingSessionOccurrence"
  ADD CONSTRAINT "TeachingSessionOccurrence_sourceOpenTeachingSlotId_fkey"
  FOREIGN KEY ("sourceOpenTeachingSlotId") REFERENCES "pms_attendance"."OpenTeachingSlot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "TeachingSessionOccurrence_source_open_slot_key"
  ON "pms_attendance"."TeachingSessionOccurrence"("sourceOpenTeachingSlotId")
  WHERE "sourceOpenTeachingSlotId" IS NOT NULL;

CREATE TABLE "pms_attendance"."OpenTeachingSlotAuditEvent" (
  "id" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "claimId" TEXT,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OpenTeachingSlotAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OpenTeachingSlotAuditEvent_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "pms_attendance"."OpenTeachingSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlotAuditEvent_claimId_fkey"
    FOREIGN KEY ("claimId") REFERENCES "pms_attendance"."OpenTeachingSlotClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlotAuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OpenTeachingSlotAuditEvent_action_check"
    CHECK ("action" IN ('OPENED','CLAIMED','WITHDRAWN','APPROVED','REJECTED','EXPIRED','CLOSED')),
  CONSTRAINT "OpenTeachingSlotAuditEvent_previous_status_check"
    CHECK ("previousStatus" IS NULL OR "previousStatus" IN ('OPEN','CLAIM_REQUESTED','ASSIGNED','CLOSED','EXPIRED')),
  CONSTRAINT "OpenTeachingSlotAuditEvent_new_status_check"
    CHECK ("newStatus" IS NULL OR "newStatus" IN ('OPEN','CLAIM_REQUESTED','ASSIGNED','CLOSED','EXPIRED'))
);
CREATE INDEX "OpenTeachingSlotAuditEvent_slot_idx"
  ON "pms_attendance"."OpenTeachingSlotAuditEvent"("slotId", "createdAt");

CREATE OR REPLACE FUNCTION "pms_attendance"."reject_open_teaching_slot_audit_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'OpenTeachingSlotAuditEvent is append-only';
END;
$$;
CREATE TRIGGER "OpenTeachingSlotAuditEvent_reject_update"
BEFORE UPDATE ON "pms_attendance"."OpenTeachingSlotAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "pms_attendance"."reject_open_teaching_slot_audit_mutation"();
CREATE TRIGGER "OpenTeachingSlotAuditEvent_reject_delete"
BEFORE DELETE ON "pms_attendance"."OpenTeachingSlotAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "pms_attendance"."reject_open_teaching_slot_audit_mutation"();

-- Backfill reusable slots from leave requests that were approved before #933.
INSERT INTO "pms_attendance"."OpenTeachingSlot"
  ("id","programmeId","sourceOccurrenceId","sourceLeaveRequestId","status","openedAt","updatedAt")
SELECT
  occurrence."id",
  leave."programmeId",
  occurrence."id",
  leave."id",
  CASE
    WHEN occurrence."sessionDate" + occurrence."scheduledEndTime"::time
      <= timezone('Asia/Phnom_Penh', CURRENT_TIMESTAMP)
    THEN 'EXPIRED'
    ELSE 'OPEN'
  END,
  COALESCE(leave."reviewedAt", leave."updatedAt", CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP
FROM "pms_attendance"."TeachingSessionOccurrence" occurrence
JOIN "pms_attendance"."TeachingLeaveRequest" leave
  ON leave."id" = occurrence."approvedLeaveRequestId" AND leave."status" = 'APPROVED'
JOIN "pms_attendance"."TeachingLeaveRequestOccurrence" link
  ON link."requestId" = leave."id"
 AND link."occurrenceId" = occurrence."id"
 AND link."releaseForReuse" = TRUE
ON CONFLICT ("sourceOccurrenceId") DO NOTHING;

INSERT INTO "pms_attendance"."OpenTeachingSlotAuditEvent"
  ("id","slotId","actorId","action","previousStatus","newStatus","details","createdAt")
SELECT
  'backfill-open-slot-' || slot."id",
  slot."id",
  COALESCE(leave."reviewedById", leave."requesterId"),
  'OPENED',
  NULL,
  slot."status",
  jsonb_build_object('backfilled', TRUE, 'sourceOccurrenceId', slot."sourceOccurrenceId"),
  slot."openedAt"
FROM "pms_attendance"."OpenTeachingSlot" slot
JOIN "pms_attendance"."TeachingLeaveRequest" leave ON leave."id" = slot."sourceLeaveRequestId"
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "pms_attendance"."OpenTeachingSlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pms_attendance"."OpenTeachingSlotClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pms_attendance"."OpenTeachingSlotAuditEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlot" FROM PUBLIC;
REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlotClaim" FROM PUBLIC;
REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlotAuditEvent" FROM PUBLIC;
REVOKE ALL ON FUNCTION "pms_attendance"."reject_open_teaching_slot_audit_mutation"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlot" FROM anon;
    REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlotClaim" FROM anon;
    REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlotAuditEvent" FROM anon;
    REVOKE ALL ON FUNCTION "pms_attendance"."reject_open_teaching_slot_audit_mutation"() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlot" FROM authenticated;
    REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlotClaim" FROM authenticated;
    REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlotAuditEvent" FROM authenticated;
    REVOKE ALL ON FUNCTION "pms_attendance"."reject_open_teaching_slot_audit_mutation"() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlot" FROM service_role;
    REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlotClaim" FROM service_role;
    REVOKE ALL ON TABLE "pms_attendance"."OpenTeachingSlotAuditEvent" FROM service_role;
    REVOKE ALL ON FUNCTION "pms_attendance"."reject_open_teaching_slot_audit_mutation"() FROM service_role;
  END IF;
END
$$;
