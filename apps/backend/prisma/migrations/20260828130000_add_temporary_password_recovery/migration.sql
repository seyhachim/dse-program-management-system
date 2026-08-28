-- Additive account-recovery state. Existing accounts remain unaffected.
ALTER TABLE "User"
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- Security events deliberately contain no password or credential material.
CREATE TYPE "UserSecurityAuditAction" AS ENUM (
  'TemporaryPasswordSet',
  'PasswordChanged'
);

CREATE TABLE "UserSecurityAuditEvent" (
  "id" TEXT NOT NULL,
  "action" "UserSecurityAuditAction" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserSecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserSecurityAuditEvent_actorUserId_createdAt_idx"
ON "UserSecurityAuditEvent"("actorUserId", "createdAt");

CREATE INDEX "UserSecurityAuditEvent_targetUserId_createdAt_idx"
ON "UserSecurityAuditEvent"("targetUserId", "createdAt");

ALTER TABLE "UserSecurityAuditEvent"
ADD CONSTRAINT "UserSecurityAuditEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserSecurityAuditEvent"
ADD CONSTRAINT "UserSecurityAuditEvent_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
