CREATE TABLE "QaSarBookRequirementRatingRevision" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "requirementId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "rating" INTEGER,
  "justification" TEXT NOT NULL DEFAULT '',
  "evidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enteredById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarBookRequirementRatingRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaSarBookRequirementRatingRevision_rating_check" CHECK ("rating" IS NULL OR ("rating" >= 1 AND "rating" <= 7)),
  CONSTRAINT "QaSarBookRequirementRatingRevision_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookRequirementRatingRevision_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookRequirementRatingRevision_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookRequirementRatingRevision_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QaSarBookRequirementRatingRevision_cycle_requirement_revision_key"
  ON "QaSarBookRequirementRatingRevision"("cycleId", "requirementId", "revisionNumber");
CREATE INDEX "QaSarBookRequirementRatingRevision_programme_cycle_idx"
  ON "QaSarBookRequirementRatingRevision"("programmeId", "cycleId");

CREATE TABLE "QaSarBookCriterionRatingRevision" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "rating" INTEGER NOT NULL,
  "opinion" TEXT NOT NULL,
  "evidenceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enteredById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarBookCriterionRatingRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaSarBookCriterionRatingRevision_rating_check" CHECK ("rating" >= 1 AND "rating" <= 7),
  CONSTRAINT "QaSarBookCriterionRatingRevision_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookCriterionRatingRevision_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookCriterionRatingRevision_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "QaCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookCriterionRatingRevision_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QaSarBookCriterionRatingRevision_cycle_criterion_revision_key"
  ON "QaSarBookCriterionRatingRevision"("cycleId", "criterionId", "revisionNumber");
CREATE INDEX "QaSarBookCriterionRatingRevision_programme_cycle_idx"
  ON "QaSarBookCriterionRatingRevision"("programmeId", "cycleId");

CREATE TABLE "QaSarBookPart3Association" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "revisionId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "criterionId" TEXT,
  "requirementId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaSarBookPart3Association_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaSarBookPart3Association_kind_check" CHECK ("kind" IN ('strength', 'weakness')),
  CONSTRAINT "QaSarBookPart3Association_section_check" CHECK ("sectionKey" IN ('part3.strengths', 'part3.weaknesses')),
  CONSTRAINT "QaSarBookPart3Association_target_check" CHECK ("criterionId" IS NOT NULL OR "requirementId" IS NOT NULL),
  CONSTRAINT "QaSarBookPart3Association_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookPart3Association_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "QaAssessmentCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookPart3Association_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "QaSarBookSectionRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookPart3Association_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "QaCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookPart3Association_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "QaRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QaSarBookPart3Association_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "QaSarBookPart3Association_programme_cycle_idx"
  ON "QaSarBookPart3Association"("programmeId", "cycleId");
CREATE INDEX "QaSarBookPart3Association_revision_idx"
  ON "QaSarBookPart3Association"("revisionId");

ALTER TABLE "QaSarBookRequirementRatingRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaSarBookCriterionRatingRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QaSarBookPart3Association" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "QaSarBookRequirementRatingRevision" FROM PUBLIC;
REVOKE ALL ON TABLE "QaSarBookCriterionRatingRevision" FROM PUBLIC;
REVOKE ALL ON TABLE "QaSarBookPart3Association" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "QaSarBookRequirementRatingRevision", "QaSarBookCriterionRatingRevision", "QaSarBookPart3Association" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "QaSarBookRequirementRatingRevision", "QaSarBookCriterionRatingRevision", "QaSarBookPart3Association" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "QaSarBookRequirementRatingRevision", "QaSarBookCriterionRatingRevision", "QaSarBookPart3Association" FROM service_role;
  END IF;
END $$;