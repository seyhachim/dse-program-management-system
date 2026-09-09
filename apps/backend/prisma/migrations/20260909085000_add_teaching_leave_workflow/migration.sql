CREATE TABLE "pms_attendance"."TeachingLeaveRequest" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "leaveType" TEXT NOT NULL,
  "confidentialReason" TEXT NOT NULL,
  "attachmentRef" TEXT,
  "proposedHandling" TEXT NOT NULL,
  "proposedNote" TEXT NOT NULL DEFAULT '',
  "noticeHours" INTEGER NOT NULL,
  "submittedLate" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ(3),
  "reviewComment" TEXT NOT NULL DEFAULT '',
  "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeachingLeaveRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeachingLeaveRequest_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "public"."Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingLeaveRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingLeaveRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingLeaveRequest_leaveType_check"
    CHECK ("leaveType" IN ('SICK','PERSONAL','OFFICIAL_DUTY','EMERGENCY','OTHER')),
  CONSTRAINT "TeachingLeaveRequest_handling_check"
    CHECK ("proposedHandling" IN ('CANCEL','RESCHEDULE','MAKE_UP','OPEN_SLOT','OTHER')),
  CONSTRAINT "TeachingLeaveRequest_status_check"
    CHECK ("status" IN ('PENDING','CHANGES_REQUESTED','APPROVED','REJECTED','WITHDRAWN')),
  CONSTRAINT "TeachingLeaveRequest_noticeHours_check" CHECK ("noticeHours" > 0 AND "noticeHours" <= 720),
  CONSTRAINT "TeachingLeaveRequest_reason_length_check" CHECK (char_length("confidentialReason") BETWEEN 1 AND 2000),
  CONSTRAINT "TeachingLeaveRequest_attachment_length_check" CHECK ("attachmentRef" IS NULL OR char_length("attachmentRef") <= 500),
  CONSTRAINT "TeachingLeaveRequest_note_length_check" CHECK (char_length("proposedNote") <= 1000),
  CONSTRAINT "TeachingLeaveRequest_review_comment_length_check" CHECK (char_length("reviewComment") <= 1500)
);

CREATE INDEX "TeachingLeaveRequest_programme_status_idx"
  ON "pms_attendance"."TeachingLeaveRequest"("programmeId", "status", "submittedAt" DESC);
CREATE INDEX "TeachingLeaveRequest_requester_idx"
  ON "pms_attendance"."TeachingLeaveRequest"("requesterId", "submittedAt" DESC);

CREATE TABLE "pms_attendance"."TeachingLeaveRequestOccurrence" (
  "requestId" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "releaseForReuse" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeachingLeaveRequestOccurrence_pkey" PRIMARY KEY ("requestId", "occurrenceId"),
  CONSTRAINT "TeachingLeaveRequestOccurrence_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "pms_attendance"."TeachingLeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingLeaveRequestOccurrence_occurrenceId_fkey"
    FOREIGN KEY ("occurrenceId") REFERENCES "pms_attendance"."TeachingSessionOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TeachingLeaveRequestOccurrence_occurrence_idx"
  ON "pms_attendance"."TeachingLeaveRequestOccurrence"("occurrenceId", "requestId");

ALTER TABLE "pms_attendance"."TeachingSessionOccurrence"
  ADD COLUMN "approvedLeaveRequestId" TEXT;
ALTER TABLE "pms_attendance"."TeachingSessionOccurrence"
  ADD CONSTRAINT "TeachingSessionOccurrence_approvedLeaveRequestId_fkey"
  FOREIGN KEY ("approvedLeaveRequestId") REFERENCES "pms_attendance"."TeachingLeaveRequest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "TeachingSessionOccurrence_approvedLeaveRequest_idx"
  ON "pms_attendance"."TeachingSessionOccurrence"("approvedLeaveRequestId")
  WHERE "approvedLeaveRequestId" IS NOT NULL;

CREATE TABLE "pms_attendance"."TeachingLeaveAuditEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TeachingLeaveAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeachingLeaveAuditEvent_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "pms_attendance"."TeachingLeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingLeaveAuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeachingLeaveAuditEvent_action_check"
    CHECK ("action" IN ('SUBMITTED','APPROVED','REJECTED','CHANGES_REQUESTED','WITHDRAWN')),
  CONSTRAINT "TeachingLeaveAuditEvent_previous_status_check"
    CHECK ("previousStatus" IS NULL OR "previousStatus" IN ('PENDING','CHANGES_REQUESTED','APPROVED','REJECTED','WITHDRAWN')),
  CONSTRAINT "TeachingLeaveAuditEvent_new_status_check"
    CHECK ("newStatus" IS NULL OR "newStatus" IN ('PENDING','CHANGES_REQUESTED','APPROVED','REJECTED','WITHDRAWN'))
);
CREATE INDEX "TeachingLeaveAuditEvent_request_idx"
  ON "pms_attendance"."TeachingLeaveAuditEvent"("requestId", "createdAt");
CREATE INDEX "TeachingLeaveAuditEvent_actor_idx"
  ON "pms_attendance"."TeachingLeaveAuditEvent"("actorId", "createdAt");

CREATE OR REPLACE FUNCTION "pms_attendance"."reject_teaching_leave_audit_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'TeachingLeaveAuditEvent is append-only';
END;
$$;
CREATE TRIGGER "TeachingLeaveAuditEvent_reject_update"
BEFORE UPDATE ON "pms_attendance"."TeachingLeaveAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "pms_attendance"."reject_teaching_leave_audit_mutation"();
CREATE TRIGGER "TeachingLeaveAuditEvent_reject_delete"
BEFORE DELETE ON "pms_attendance"."TeachingLeaveAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "pms_attendance"."reject_teaching_leave_audit_mutation"();

ALTER TABLE "pms_attendance"."TeachingLeaveRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pms_attendance"."TeachingLeaveRequestOccurrence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pms_attendance"."TeachingLeaveAuditEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveRequest" FROM PUBLIC;
REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveRequestOccurrence" FROM PUBLIC;
REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveAuditEvent" FROM PUBLIC;
REVOKE ALL ON FUNCTION "pms_attendance"."reject_teaching_leave_audit_mutation"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveRequest" FROM anon;
    REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveRequestOccurrence" FROM anon;
    REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveAuditEvent" FROM anon;
    REVOKE ALL ON FUNCTION "pms_attendance"."reject_teaching_leave_audit_mutation"() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveRequest" FROM authenticated;
    REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveRequestOccurrence" FROM authenticated;
    REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveAuditEvent" FROM authenticated;
    REVOKE ALL ON FUNCTION "pms_attendance"."reject_teaching_leave_audit_mutation"() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveRequest" FROM service_role;
    REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveRequestOccurrence" FROM service_role;
    REVOKE ALL ON TABLE "pms_attendance"."TeachingLeaveAuditEvent" FROM service_role;
    REVOKE ALL ON FUNCTION "pms_attendance"."reject_teaching_leave_audit_mutation"() FROM service_role;
  END IF;
END
$$;
