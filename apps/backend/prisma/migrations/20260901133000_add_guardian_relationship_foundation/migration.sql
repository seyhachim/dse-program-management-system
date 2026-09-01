-- Issue #790: parent/guardian identity and relationship authorization foundation.
-- Guardian relationship data is backend-owned and intentionally isolated from the
-- Supabase Data API. Academic records remain canonical in their existing tables.

CREATE SCHEMA IF NOT EXISTS "guardian_portal";

-- Guardian is a coarse authentication/navigation role only. Exact student access
-- is always granted by StudentGuardianRelationship + GuardianRelationshipScope.
INSERT INTO "public"."Role" (
  "id", "slug", "title", "description", "active", "createdAt", "updatedAt"
)
VALUES (
  'role-guardian',
  'guardian',
  'Parent / Guardian',
  'Verified parent/guardian account. Student access is relationship-scoped and revocable.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

CREATE TABLE "guardian_portal"."GuardianProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuardianProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuardianProfile_userId_key" UNIQUE ("userId"),
  CONSTRAINT "GuardianProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "guardian_portal"."StudentGuardianRelationship" (
  "id" TEXT NOT NULL,
  "guardianProfileId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "effectiveFrom" TIMESTAMPTZ NOT NULL,
  "effectiveTo" TIMESTAMPTZ,
  "verificationMethod" TEXT,
  "verificationNotes" TEXT,
  "verifiedByUserId" TEXT,
  "verifiedAt" TIMESTAMPTZ,
  "revokedByUserId" TEXT,
  "revokedAt" TIMESTAMPTZ,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentGuardianRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentGuardianRelationship_guardianProfileId_fkey"
    FOREIGN KEY ("guardianProfileId") REFERENCES "guardian_portal"."GuardianProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentGuardianRelationship_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentGuardianRelationship_programmeId_fkey"
    FOREIGN KEY ("programmeId") REFERENCES "public"."Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentGuardianRelationship_verifiedByUserId_fkey"
    FOREIGN KEY ("verifiedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentGuardianRelationship_revokedByUserId_fkey"
    FOREIGN KEY ("revokedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentGuardianRelationship_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentGuardianRelationship_type_check"
    CHECK ("relationshipType" IN ('MOTHER', 'FATHER', 'LEGAL_GUARDIAN', 'OTHER_AUTHORIZED_GUARDIAN')),
  CONSTRAINT "StudentGuardianRelationship_status_check"
    CHECK ("status" IN ('PENDING', 'VERIFIED', 'REVOKED', 'ENDED')),
  CONSTRAINT "StudentGuardianRelationship_effective_dates_check"
    CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE INDEX "StudentGuardianRelationship_guardian_status_idx"
  ON "guardian_portal"."StudentGuardianRelationship"("guardianProfileId", "status", "effectiveFrom", "effectiveTo");
CREATE INDEX "StudentGuardianRelationship_student_status_idx"
  ON "guardian_portal"."StudentGuardianRelationship"("studentId", "status", "effectiveFrom", "effectiveTo");
CREATE INDEX "StudentGuardianRelationship_programme_idx"
  ON "guardian_portal"."StudentGuardianRelationship"("programmeId", "status");

CREATE TABLE "guardian_portal"."GuardianRelationshipScope" (
  "relationshipId" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuardianRelationshipScope_pkey" PRIMARY KEY ("relationshipId", "scope"),
  CONSTRAINT "GuardianRelationshipScope_relationshipId_fkey"
    FOREIGN KEY ("relationshipId") REFERENCES "guardian_portal"."StudentGuardianRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GuardianRelationshipScope_scope_check"
    CHECK ("scope" IN (
      'attendance', 'academic_status', 'official_results', 'announcements',
      'academic_calendar', 'support_cases', 'meeting_requests', 'parent_feedback'
    ))
);

CREATE INDEX "GuardianRelationshipScope_scope_idx"
  ON "guardian_portal"."GuardianRelationshipScope"("scope", "relationshipId");

CREATE TABLE "guardian_portal"."GuardianRelationshipAuditEvent" (
  "id" TEXT NOT NULL,
  "relationshipId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuardianRelationshipAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuardianRelationshipAuditEvent_relationshipId_fkey"
    FOREIGN KEY ("relationshipId") REFERENCES "guardian_portal"."StudentGuardianRelationship"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuardianRelationshipAuditEvent_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "GuardianRelationshipAuditEvent_relationship_created_idx"
  ON "guardian_portal"."GuardianRelationshipAuditEvent"("relationshipId", "createdAt" DESC);
CREATE INDEX "GuardianRelationshipAuditEvent_actor_created_idx"
  ON "guardian_portal"."GuardianRelationshipAuditEvent"("actorUserId", "createdAt" DESC);

-- Audit events are append-only evidence. Corrections append a new event instead of
-- rewriting the historical record.
CREATE OR REPLACE FUNCTION "guardian_portal"."reject_guardian_audit_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Guardian relationship audit events are append-only';
END;
$$;

CREATE TRIGGER "GuardianRelationshipAuditEvent_no_update"
BEFORE UPDATE ON "guardian_portal"."GuardianRelationshipAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "guardian_portal"."reject_guardian_audit_mutation"();

CREATE TRIGGER "GuardianRelationshipAuditEvent_no_delete"
BEFORE DELETE ON "guardian_portal"."GuardianRelationshipAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "guardian_portal"."reject_guardian_audit_mutation"();

-- Browser/Data API roles must not receive direct access to guardian relationship
-- records. The backend remains the only policy enforcement boundary.
DO $$
DECLARE role_name TEXT;
BEGIN
  REVOKE ALL ON SCHEMA "guardian_portal" FROM PUBLIC;
  REVOKE ALL ON ALL TABLES IN SCHEMA "guardian_portal" FROM PUBLIC;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "guardian_portal" FROM PUBLIC;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA "guardian_portal" FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA "guardian_portal" FROM %I', role_name);
    EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "guardian_portal" FROM %I', role_name);
  END LOOP;
END $$;
