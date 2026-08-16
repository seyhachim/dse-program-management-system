CREATE TYPE "ClassResponsibilityRole" AS ENUM ('ClassMonitor', 'SubClassMonitor');
CREATE TYPE "ClassResponsibilityAuditAction" AS ENUM ('Assigned', 'Revoked', 'Reassigned');

CREATE TABLE "ClassResponsibilityAssignment" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "role" "ClassResponsibilityRole" NOT NULL,
  "assignedById" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassResponsibilityAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassResponsibilityAssignment_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassResponsibilityAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassResponsibilityAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassResponsibilityAssignment_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ClassResponsibilityAuditEvent" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT,
  "offeringId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" "ClassResponsibilityAuditAction" NOT NULL,
  "previousRole" "ClassResponsibilityRole",
  "newRole" "ClassResponsibilityRole",
  "reason" TEXT NOT NULL DEFAULT '',
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassResponsibilityAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClassResponsibilityAuditEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ClassResponsibilityAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassResponsibilityAuditEvent_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassResponsibilityAuditEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClassResponsibilityAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ClassResponsibilityAssignment_offeringId_idx" ON "ClassResponsibilityAssignment"("offeringId");
CREATE INDEX "ClassResponsibilityAssignment_studentId_offeringId_idx" ON "ClassResponsibilityAssignment"("studentId", "offeringId");
CREATE INDEX "ClassResponsibilityAssignment_offeringId_role_idx" ON "ClassResponsibilityAssignment"("offeringId", "role");
CREATE INDEX "ClassResponsibilityAssignment_offeringId_revokedAt_idx" ON "ClassResponsibilityAssignment"("offeringId", "revokedAt");
CREATE INDEX "ClassResponsibilityAssignment_assignedById_idx" ON "ClassResponsibilityAssignment"("assignedById");
CREATE INDEX "ClassResponsibilityAssignment_revokedById_idx" ON "ClassResponsibilityAssignment"("revokedById");
CREATE UNIQUE INDEX "ClassResponsibilityAssignment_active_offering_role_key" ON "ClassResponsibilityAssignment"("offeringId", "role") WHERE "revokedAt" IS NULL;
CREATE UNIQUE INDEX "ClassResponsibilityAssignment_active_offering_student_key" ON "ClassResponsibilityAssignment"("offeringId", "studentId") WHERE "revokedAt" IS NULL;

CREATE INDEX "ClassResponsibilityAuditEvent_offeringId_createdAt_idx" ON "ClassResponsibilityAuditEvent"("offeringId", "createdAt");
CREATE INDEX "ClassResponsibilityAuditEvent_studentId_idx" ON "ClassResponsibilityAuditEvent"("studentId");
CREATE INDEX "ClassResponsibilityAuditEvent_actorId_idx" ON "ClassResponsibilityAuditEvent"("actorId");
CREATE INDEX "ClassResponsibilityAuditEvent_assignmentId_idx" ON "ClassResponsibilityAuditEvent"("assignmentId");

ALTER TABLE "ClassResponsibilityAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClassResponsibilityAuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ClassResponsibilityAssignment" FROM PUBLIC;
REVOKE ALL ON TABLE "ClassResponsibilityAuditEvent" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "ClassResponsibilityAssignment" FROM anon;
    REVOKE ALL ON TABLE "ClassResponsibilityAuditEvent" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "ClassResponsibilityAssignment" FROM authenticated;
    REVOKE ALL ON TABLE "ClassResponsibilityAuditEvent" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "ClassResponsibilityAssignment" FROM service_role;
    REVOKE ALL ON TABLE "ClassResponsibilityAuditEvent" FROM service_role;
  END IF;
END
$$;
