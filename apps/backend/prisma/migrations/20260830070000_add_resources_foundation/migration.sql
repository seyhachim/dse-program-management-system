-- Issue #751: additive programme resources/inventory foundation.
-- Timetable rooms remain OfferingMeeting.room free text for now; ResourceLocation
-- is a programme-managed logical inventory location and does not schedule classes.

CREATE TYPE "ResourceTrackingMode" AS ENUM ('QUANTITY', 'SERIALIZED');
CREATE TYPE "ResourceResponsibilityType" AS ENUM ('RESOURCE_COORDINATOR', 'LAB_CUSTODIAN');
CREATE TYPE "ResourceResponsibilityAuditAction" AS ENUM ('Assigned', 'Renewed', 'Ended', 'HandoverOut', 'HandoverIn');

CREATE TABLE "ResourceType" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "trackingMode" "ResourceTrackingMode" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResourceLocation" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResourceResponsibilityAssignment" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "responsibility" "ResourceResponsibilityType" NOT NULL,
    "locationId" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "assignedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceResponsibilityAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ResourceResponsibilityAssignment_date_check"
      CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
    CONSTRAINT "ResourceResponsibilityAssignment_scope_check"
      CHECK (
        ("responsibility" = 'RESOURCE_COORDINATOR' AND "locationId" IS NULL)
        OR
        ("responsibility" = 'LAB_CUSTODIAN' AND "locationId" IS NOT NULL)
      )
);

CREATE TABLE "ResourceResponsibilityAuditEvent" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT,
    "programmeId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "ResourceResponsibilityAuditAction" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResourceResponsibilityAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResourceType_programmeId_name_key" ON "ResourceType"("programmeId", "name");
CREATE INDEX "ResourceType_programmeId_active_idx" ON "ResourceType"("programmeId", "active");
CREATE INDEX "ResourceType_programmeId_category_idx" ON "ResourceType"("programmeId", "category");
CREATE UNIQUE INDEX "ResourceLocation_programmeId_code_key" ON "ResourceLocation"("programmeId", "code");
CREATE UNIQUE INDEX "ResourceLocation_programmeId_name_key" ON "ResourceLocation"("programmeId", "name");
CREATE INDEX "ResourceLocation_programmeId_active_idx" ON "ResourceLocation"("programmeId", "active");
CREATE INDEX "ResourceResponsibilityAssignment_programmeId_responsibility_effectiveFrom_effectiveTo_idx"
  ON "ResourceResponsibilityAssignment"("programmeId", "responsibility", "effectiveFrom", "effectiveTo");
CREATE INDEX "ResourceResponsibilityAssignment_userId_programmeId_idx" ON "ResourceResponsibilityAssignment"("userId", "programmeId");
CREATE INDEX "ResourceResponsibilityAssignment_locationId_idx" ON "ResourceResponsibilityAssignment"("locationId");
CREATE INDEX "ResourceResponsibilityAssignment_assignedById_idx" ON "ResourceResponsibilityAssignment"("assignedById");
CREATE INDEX "ResourceResponsibilityAuditEvent_programmeId_createdAt_idx" ON "ResourceResponsibilityAuditEvent"("programmeId", "createdAt");
CREATE INDEX "ResourceResponsibilityAuditEvent_assignmentId_createdAt_idx" ON "ResourceResponsibilityAuditEvent"("assignmentId", "createdAt");
CREATE INDEX "ResourceResponsibilityAuditEvent_actorId_idx" ON "ResourceResponsibilityAuditEvent"("actorId");

ALTER TABLE "ResourceType" ADD CONSTRAINT "ResourceType_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceLocation" ADD CONSTRAINT "ResourceLocation_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceResponsibilityAssignment" ADD CONSTRAINT "ResourceResponsibilityAssignment_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceResponsibilityAssignment" ADD CONSTRAINT "ResourceResponsibilityAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceResponsibilityAssignment" ADD CONSTRAINT "ResourceResponsibilityAssignment_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "ResourceLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceResponsibilityAssignment" ADD CONSTRAINT "ResourceResponsibilityAssignment_assignedById_fkey"
  FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceResponsibilityAuditEvent" ADD CONSTRAINT "ResourceResponsibilityAuditEvent_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ResourceResponsibilityAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceResponsibilityAuditEvent" ADD CONSTRAINT "ResourceResponsibilityAuditEvent_programmeId_fkey"
  FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResourceResponsibilityAuditEvent" ADD CONSTRAINT "ResourceResponsibilityAuditEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Public-schema PMS tables are backend-only. Keep the same fail-closed DB boundary
-- verified by scripts/verify-db-security.ts: RLS enabled and no Data API grants.
ALTER TABLE "ResourceType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourceLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourceResponsibilityAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResourceResponsibilityAuditEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ResourceType", "ResourceLocation", "ResourceResponsibilityAssignment", "ResourceResponsibilityAuditEvent" FROM PUBLIC;
DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE "ResourceType", "ResourceLocation", "ResourceResponsibilityAssignment", "ResourceResponsibilityAuditEvent" FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$$;

-- Governance events are append-only. Assignment lifecycle changes are represented
-- by effective dates plus new audit events rather than editing audit history.
CREATE OR REPLACE FUNCTION reject_resource_responsibility_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ResourceResponsibilityAuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ResourceResponsibilityAuditEvent_no_update"
BEFORE UPDATE ON "ResourceResponsibilityAuditEvent"
FOR EACH ROW EXECUTE FUNCTION reject_resource_responsibility_audit_mutation();
CREATE TRIGGER "ResourceResponsibilityAuditEvent_no_delete"
BEFORE DELETE ON "ResourceResponsibilityAuditEvent"
FOR EACH ROW EXECUTE FUNCTION reject_resource_responsibility_audit_mutation();

-- Deploy permission rows as part of migrate deploy; seed sync remains idempotent for
-- development and repair. Responsibility-aware capabilities are still enforced in
-- the Resources service/policy, so assigning the Secretary does not grant approval.
INSERT INTO "Permission" ("id", "slug", "title", "active", "createdAt", "updatedAt") VALUES
  ('permission-inventory-read', 'inventory:read', 'View programme resources and inventory', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-inventory-write', 'inventory:write', 'Manage programme resource catalogue and inventory records', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-inventory-receive', 'inventory:receive', 'Record programme resource receipts', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-inventory-approve', 'inventory:approve', 'Approve programme resource governance actions', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('permission-inventory-maintain', 'inventory:maintain', 'Maintain resource condition and location records', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt", "updatedAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p ON p."slug" IN ('inventory:read', 'inventory:write', 'inventory:receive', 'inventory:approve', 'inventory:maintain')
WHERE r."slug" IN ('admin', 'program_coordinator')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "createdAt", "updatedAt")
SELECT r."id", p."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p ON p."slug" = 'inventory:read'
WHERE r."slug" IN ('program_secretary', 'qa_contributor', 'qa_reviewer')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
