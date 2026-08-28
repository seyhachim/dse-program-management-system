CREATE TABLE "QaSarBookTerminology" (
  "programmeId" TEXT NOT NULL,
  "evidenceCitationLabel" TEXT NOT NULL DEFAULT 'Exhibit',
  "evidenceRegisterTitle" TEXT NOT NULL DEFAULT 'List of Exhibits',
  "appendixLabel" TEXT NOT NULL DEFAULT 'Appendix',
  "requirementLabel" TEXT NOT NULL DEFAULT 'Requirement',
  "criterionLabel" TEXT NOT NULL DEFAULT 'Criterion',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarBookTerminology_pkey" PRIMARY KEY ("programmeId"),
  CONSTRAINT "QaSarBookTerminology_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookTerminology_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "QaSarBookSectionEvidenceReference" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarBookSectionEvidenceReference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaSarBookSectionEvidenceReference_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionEvidenceReference_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionEvidenceReference_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "QaSarBookSectionRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionEvidenceReference_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "QaEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookSectionEvidenceReference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QaSarBookSectionEvidenceReference_revisionId_evidenceId_key"
  ON "QaSarBookSectionEvidenceReference"("revisionId", "evidenceId");
CREATE INDEX "QaSarBookSectionEvidenceReference_cycleId_sectionKey_idx"
  ON "QaSarBookSectionEvidenceReference"("cycleId", "sectionKey");
CREATE INDEX "QaSarBookSectionEvidenceReference_evidenceId_idx"
  ON "QaSarBookSectionEvidenceReference"("evidenceId");

CREATE TABLE "QaSarBookEvidencePresentation" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "appendixGroup" TEXT NOT NULL DEFAULT 'other',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarBookEvidencePresentation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaSarBookEvidencePresentation_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookEvidencePresentation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookEvidencePresentation_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "QaEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookEvidencePresentation_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookEvidencePresentation_appendixGroup_check" CHECK (
    "appendixGroup" IN ('programme','curriculum','teachingLearning','assessment','staff','studentSupport','facilities','outcomes','governance','other')
  )
);

CREATE UNIQUE INDEX "QaSarBookEvidencePresentation_cycleId_evidenceId_key"
  ON "QaSarBookEvidencePresentation"("cycleId", "evidenceId");
CREATE INDEX "QaSarBookEvidencePresentation_programmeId_cycleId_idx"
  ON "QaSarBookEvidencePresentation"("programmeId", "cycleId");

ALTER TABLE "QaSarBookTerminology" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaSarBookSectionEvidenceReference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaSarBookEvidencePresentation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "QaSarBookTerminology" FROM PUBLIC;
REVOKE ALL ON TABLE "QaSarBookSectionEvidenceReference" FROM PUBLIC;
REVOKE ALL ON TABLE "QaSarBookEvidencePresentation" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookTerminology" FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionEvidenceReference" FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookEvidencePresentation" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookTerminology" FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionEvidenceReference" FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookEvidencePresentation" FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookTerminology" FROM service_role';
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookSectionEvidenceReference" FROM service_role';
    EXECUTE 'REVOKE ALL ON TABLE "QaSarBookEvidencePresentation" FROM service_role';
  END IF;
END $$;
