-- Existing unallocated rows may predate explicit meeting ownership. Keep them
-- closed by default so unknown legacy ownership is never advertised as a real
-- vacancy. Programme staff must explicitly open a meeting for requests.
ALTER TABLE "OfferingMeeting"
  ADD COLUMN "openForAssignment" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "pms_attendance"."OfferingMeetingTeachingRequest" (
  "id" TEXT PRIMARY KEY,
  "programmeId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMPTZ,
  "reviewComment" TEXT,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferingMeetingTeachingRequest_status_check"
    CHECK ("status" IN ('PENDING','APPROVED','REJECTED','SUPERSEDED')),
  CONSTRAINT "OfferingMeetingTeachingRequest_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT,
  CONSTRAINT "OfferingMeetingTeachingRequest_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT,
  CONSTRAINT "OfferingMeetingTeachingRequest_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "OfferingMeeting"("id") ON DELETE RESTRICT,
  CONSTRAINT "OfferingMeetingTeachingRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "OfferingMeetingTeachingRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "OfferingMeetingTeachingRequest_pending_requester_meeting_key"
  ON "pms_attendance"."OfferingMeetingTeachingRequest" ("meetingId", "requesterId")
  WHERE "status" = 'PENDING';

CREATE INDEX "OfferingMeetingTeachingRequest_programme_status_idx"
  ON "pms_attendance"."OfferingMeetingTeachingRequest" ("programmeId", "status", "requestedAt");

CREATE INDEX "OfferingMeetingTeachingRequest_requester_idx"
  ON "pms_attendance"."OfferingMeetingTeachingRequest" ("requesterId", "requestedAt");

CREATE TABLE "pms_attendance"."OfferingMeetingTeachingRequestAuditEvent" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousStatus" TEXT,
  "newStatus" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferingMeetingTeachingRequestAuditEvent_requestId_fkey"
    FOREIGN KEY ("requestId")
    REFERENCES "pms_attendance"."OfferingMeetingTeachingRequest"("id")
    ON DELETE RESTRICT,
  CONSTRAINT "OfferingMeetingTeachingRequestAuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "OfferingMeetingTeachingRequestAuditEvent_action_check"
    CHECK ("action" IN ('SUBMITTED','APPROVED','REJECTED','SUPERSEDED'))
);

CREATE INDEX "OfferingMeetingTeachingRequestAuditEvent_request_idx"
  ON "pms_attendance"."OfferingMeetingTeachingRequestAuditEvent" ("requestId", "createdAt");

CREATE OR REPLACE FUNCTION "pms_attendance"."prevent_offering_meeting_teaching_request_audit_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Offering meeting teaching request audit events are append-only';
END;
$$;

CREATE TRIGGER "OfferingMeetingTeachingRequestAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "pms_attendance"."OfferingMeetingTeachingRequestAuditEvent"
FOR EACH ROW
EXECUTE FUNCTION "pms_attendance"."prevent_offering_meeting_teaching_request_audit_mutation"();

ALTER TABLE "pms_attendance"."OfferingMeetingTeachingRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pms_attendance"."OfferingMeetingTeachingRequestAuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "pms_attendance"."OfferingMeetingTeachingRequest" FROM PUBLIC;
REVOKE ALL ON TABLE "pms_attendance"."OfferingMeetingTeachingRequestAuditEvent" FROM PUBLIC;

DO $request_roles$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE "pms_attendance"."OfferingMeetingTeachingRequest" FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON TABLE "pms_attendance"."OfferingMeetingTeachingRequestAuditEvent" FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$request_roles$;
