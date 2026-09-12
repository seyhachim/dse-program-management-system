-- Break-glass activation governance for Course Offerings whose canonical
-- curriculum placement and/or Approved CourseSpec is still pending.
--
-- The exception is deliberately stored in the protected offering_governance
-- schema introduced for exact curriculum binding. It authorizes operational
-- teaching only; it never mutates or fabricates curriculum/CourseSpec approval.

CREATE SCHEMA IF NOT EXISTS offering_governance;

REVOKE ALL ON SCHEMA offering_governance FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA offering_governance
  REVOKE ALL ON TABLES FROM PUBLIC;

CREATE TYPE offering_governance."OfferingActivationExceptionStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'RESOLVED',
  'REVOKED',
  'EXPIRED'
);

CREATE TYPE offering_governance."OfferingActivationExceptionAuditAction" AS ENUM (
  'Requested',
  'Approved',
  'Rejected',
  'Revoked',
  'Resolved',
  'Expired'
);

CREATE TABLE offering_governance."OfferingActivationException" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "status" offering_governance."OfferingActivationExceptionStatus" NOT NULL DEFAULT 'PENDING',
  "missingCurriculum" BOOLEAN NOT NULL DEFAULT FALSE,
  "missingCourseSpec" BOOLEAN NOT NULL DEFAULT FALSE,
  "reason" TEXT NOT NULL,
  "documentationDueDate" DATE NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT NOT NULL DEFAULT '',
  "resolvedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferingActivationException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferingActivationException_missing_item_check"
    CHECK ("missingCurriculum" OR "missingCourseSpec"),
  CONSTRAINT "OfferingActivationException_reason_check"
    CHECK (length(btrim("reason")) >= 10),
  CONSTRAINT "OfferingActivationException_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES public."Offering"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivationException_requestedByUserId_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivationException_reviewedByUserId_fkey"
    FOREIGN KEY ("reviewedByUserId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OfferingActivationException_one_open_per_offering_key"
  ON offering_governance."OfferingActivationException"("offeringId")
  WHERE "status" IN ('PENDING', 'APPROVED');

CREATE INDEX "OfferingActivationException_offeringId_requestedAt_idx"
  ON offering_governance."OfferingActivationException"("offeringId", "requestedAt" DESC);
CREATE INDEX "OfferingActivationException_status_dueDate_idx"
  ON offering_governance."OfferingActivationException"("status", "documentationDueDate");
CREATE INDEX "OfferingActivationException_requestedByUserId_idx"
  ON offering_governance."OfferingActivationException"("requestedByUserId");
CREATE INDEX "OfferingActivationException_reviewedByUserId_idx"
  ON offering_governance."OfferingActivationException"("reviewedByUserId");

CREATE TABLE offering_governance."OfferingActivationExceptionAuditEvent" (
  "id" TEXT NOT NULL,
  "exceptionId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" offering_governance."OfferingActivationExceptionAuditAction" NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferingActivationExceptionAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OfferingActivationExceptionAuditEvent_exceptionId_fkey"
    FOREIGN KEY ("exceptionId") REFERENCES offering_governance."OfferingActivationException"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivationExceptionAuditEvent_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES public."Offering"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingActivationExceptionAuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "OfferingActivationExceptionAuditEvent_offeringId_createdAt_idx"
  ON offering_governance."OfferingActivationExceptionAuditEvent"("offeringId", "createdAt");
CREATE INDEX "OfferingActivationExceptionAuditEvent_exceptionId_createdAt_idx"
  ON offering_governance."OfferingActivationExceptionAuditEvent"("exceptionId", "createdAt");
CREATE INDEX "OfferingActivationExceptionAuditEvent_actorId_idx"
  ON offering_governance."OfferingActivationExceptionAuditEvent"("actorId");

-- Completion is an academic lifecycle transition and must fail closed while an
-- activation exception is still open. This database boundary protects every
-- backend path, including the legacy and exact-curriculum Offering services.
CREATE OR REPLACE FUNCTION offering_governance."guardOfferingCompletionWithActivationException"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, offering_governance
AS $function$
BEGIN
  IF NEW."status" = 'Completed' AND OLD."status" IS DISTINCT FROM 'Completed' THEN
    IF EXISTS (
      SELECT 1
      FROM offering_governance."OfferingActivationException" exception
      WHERE exception."offeringId" = NEW."id"
        AND exception."status" IN ('PENDING', 'APPROVED')
    ) THEN
      RAISE EXCEPTION 'Resolve the Offering activation exception before completion'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER "Offering_activation_exception_completion_guard"
BEFORE UPDATE OF "status" ON public."Offering"
FOR EACH ROW
EXECUTE FUNCTION offering_governance."guardOfferingCompletionWithActivationException"();

ALTER TABLE offering_governance."OfferingActivationException" ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_governance."OfferingActivationExceptionAuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA offering_governance FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA offering_governance FROM PUBLIC;

-- Local/integration PostgreSQL may not define Supabase Data API roles. Revoke
-- them conditionally so the same migration is safe in CI/local and Supabase.
DO $offering_governance_roles$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA offering_governance FROM %I', role_name);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA offering_governance REVOKE ALL ON TABLES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA offering_governance REVOKE ALL ON FUNCTIONS FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON ALL TABLES IN SCHEMA offering_governance FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA offering_governance FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$offering_governance_roles$;
