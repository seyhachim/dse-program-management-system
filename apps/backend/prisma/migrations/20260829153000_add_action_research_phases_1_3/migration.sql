-- Action Research phases 1-3 (#721 #722 #723)
-- Additive tables intentionally use raw SQL, matching several QA extension tables.

CREATE TABLE "ActionResearchProject" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "problemStatement" TEXT NOT NULL,
  "researchQuestion" TEXT NOT NULL DEFAULT '',
  "courseId" TEXT,
  "offeringId" TEXT,
  "cohortId" TEXT,
  "academicYear" TEXT NOT NULL DEFAULT '',
  "semester" TEXT NOT NULL DEFAULT '',
  "cloId" TEXT,
  "ploId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchProject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionResearchProject_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ActionResearchProject_programmeId_status_idx"
  ON "ActionResearchProject"("programmeId", "status");
CREATE INDEX "ActionResearchProject_createdById_idx"
  ON "ActionResearchProject"("createdById");

CREATE TABLE "ActionResearchCycle" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "cycleNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "systemBoundary" TEXT NOT NULL DEFAULT '',
  "dynamicHypothesis" TEXT NOT NULL DEFAULT '',
  "baselineStart" TIMESTAMP(3),
  "baselineEnd" TIMESTAMP(3),
  "interventionStart" TIMESTAMP(3),
  "observationEnd" TIMESTAMP(3),
  "decision" TEXT,
  "decisionRationale" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchCycle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionResearchCycle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ActionResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ActionResearchCycle_projectId_cycleNumber_key"
  ON "ActionResearchCycle"("projectId", "cycleNumber");
CREATE INDEX "ActionResearchCycle_projectId_status_idx"
  ON "ActionResearchCycle"("projectId", "status");

CREATE TABLE "ActionResearchAssignment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "instructions" TEXT NOT NULL DEFAULT '',
  "dueDate" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionResearchAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ActionResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchAssignment_role_check" CHECK ("role" IN ('LEAD_RESEARCHER','CO_RESEARCHER','REVIEWER')),
  CONSTRAINT "ActionResearchAssignment_status_check" CHECK ("status" IN ('ASSIGNED','ACCEPTED','IN_PROGRESS','SUBMITTED','REVISION_REQUIRED','COMPLETED'))
);

CREATE UNIQUE INDEX "ActionResearchAssignment_projectId_assigneeId_role_key"
  ON "ActionResearchAssignment"("projectId", "assigneeId", "role");
CREATE INDEX "ActionResearchAssignment_assigneeId_status_idx"
  ON "ActionResearchAssignment"("assigneeId", "status");

CREATE TABLE "ActionResearchProtocol" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "practicalProblem" TEXT NOT NULL,
  "researchQuestion" TEXT NOT NULL,
  "systemBoundary" TEXT NOT NULL,
  "baselinePattern" TEXT NOT NULL DEFAULT '',
  "dynamicHypothesis" TEXT NOT NULL DEFAULT '',
  "interventionPlan" TEXT NOT NULL DEFAULT '',
  "expectedDelay" TEXT NOT NULL DEFAULT '',
  "primaryIndicators" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "secondaryIndicators" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "successCriteria" TEXT NOT NULL DEFAULT '',
  "comparisonDesign" TEXT NOT NULL DEFAULT '',
  "dataSources" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "analysisPlan" TEXT NOT NULL DEFAULT '',
  "fidelityPlan" TEXT NOT NULL DEFAULT '',
  "ethicsPrivacyStatus" TEXT NOT NULL DEFAULT '',
  "validityRisks" TEXT NOT NULL DEFAULT '',
  "plannedReflectionDate" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchProtocol_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionResearchProtocol_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ActionResearchCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchProtocol_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchProtocol_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchProtocol_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','REVISION_REQUIRED','APPROVED'))
);

CREATE UNIQUE INDEX "ActionResearchProtocol_cycleId_version_key"
  ON "ActionResearchProtocol"("cycleId", "version");
CREATE INDEX "ActionResearchProtocol_cycleId_status_idx"
  ON "ActionResearchProtocol"("cycleId", "status");

CREATE TABLE "ActionResearchProtocolReview" (
  "id" TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "comment" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchProtocolReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionResearchProtocolReview_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ActionResearchProtocol"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchProtocolReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchProtocolReview_action_check" CHECK ("action" IN ('REQUEST_REVISION','APPROVE'))
);

CREATE INDEX "ActionResearchProtocolReview_protocolId_createdAt_idx"
  ON "ActionResearchProtocolReview"("protocolId", "createdAt");

CREATE TABLE "ActionResearchBaselineLock" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "protocolId" TEXT NOT NULL,
  "baselineStart" TIMESTAMP(3) NOT NULL,
  "baselineEnd" TIMESTAMP(3) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "lockedById" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchBaselineLock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionResearchBaselineLock_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ActionResearchCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchBaselineLock_protocolId_fkey" FOREIGN KEY ("protocolId") REFERENCES "ActionResearchProtocol"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchBaselineLock_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ActionResearchBaselineLock_cycleId_key"
  ON "ActionResearchBaselineLock"("cycleId");

CREATE TABLE "ActionResearchAuditEvent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "cycleId" TEXT,
  "actorId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionResearchAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActionResearchAuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ActionResearchProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchAuditEvent_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ActionResearchCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActionResearchAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ActionResearchAuditEvent_projectId_createdAt_idx"
  ON "ActionResearchAuditEvent"("projectId", "createdAt");
