CREATE TABLE "QaSarBookSectionRevision" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "plainText" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarBookSectionRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaSarBookSectionRevision_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionRevision_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionRevision_revisionNumber_check" CHECK ("revisionNumber" > 0)
);

CREATE UNIQUE INDEX "QaSarBookSectionRevision_cycleId_sectionKey_revisionNumber_key"
  ON "QaSarBookSectionRevision"("cycleId", "sectionKey", "revisionNumber");
CREATE INDEX "QaSarBookSectionRevision_programmeId_cycleId_sectionKey_idx"
  ON "QaSarBookSectionRevision"("programmeId", "cycleId", "sectionKey");
CREATE INDEX "QaSarBookSectionRevision_createdById_idx"
  ON "QaSarBookSectionRevision"("createdById");

INSERT INTO "QaSarBookSectionRevision" (
  "id", "programmeId", "cycleId", "sectionKey", "revisionNumber",
  "content", "plainText", "createdById", "createdAt"
)
SELECT
  n."id", n."programmeId", n."cycleId", n."sectionKey", 1,
  n."content", n."plainText", n."updatedById", n."updatedAt"
FROM "QaSarBookNarrativeSection" n
WHERE NOT EXISTS (
  SELECT 1
  FROM "QaSarBookSectionRevision" r
  WHERE r."cycleId" = n."cycleId"
    AND r."sectionKey" = n."sectionKey"
);

CREATE TABLE "QaSarBookSectionAssignment" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "assigneeId" TEXT NOT NULL,
  "assignedById" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  CONSTRAINT "QaSarBookSectionAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaSarBookSectionAssignment_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionAssignment_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QaSarBookSectionAssignment_active_key"
  ON "QaSarBookSectionAssignment"("cycleId", "sectionKey")
  WHERE "endedAt" IS NULL;
CREATE INDEX "QaSarBookSectionAssignment_programmeId_cycleId_idx"
  ON "QaSarBookSectionAssignment"("programmeId", "cycleId");
CREATE INDEX "QaSarBookSectionAssignment_assigneeId_active_idx"
  ON "QaSarBookSectionAssignment"("assigneeId", "cycleId")
  WHERE "endedAt" IS NULL;

ALTER TABLE "QaSarBookSectionRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaSarBookSectionAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "QaSarBookSectionRevision" FROM PUBLIC;
REVOKE ALL ON TABLE "QaSarBookSectionAssignment" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionRevision" FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionAssignment" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionRevision" FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionAssignment" FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionRevision" FROM service_role';
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionAssignment" FROM service_role';
  END IF;
END $$;