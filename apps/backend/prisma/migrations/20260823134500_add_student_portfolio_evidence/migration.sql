-- Issue #573: student-owned portfolio evidence and safe artifact links.
-- Portfolio evidence is a presentation/provenance layer only; canonical academic
-- records remain in CourseSpec/Offering/AssessmentResult and are never copied or edited.

CREATE TYPE "StudentPortfolioEvidenceOrigin" AS ENUM (
  'ExternalProject',
  'CourseAssessment',
  'Practicum',
  'Internship',
  'FinalProject',
  'Competition',
  'Achievement',
  'Other'
);

CREATE TYPE "StudentPortfolioEvidenceSourceType" AS ENUM ('CourseAssessment');
CREATE TYPE "StudentPortfolioArtifactKind" AS ENUM (
  'Repository',
  'Demo',
  'Report',
  'Presentation',
  'Dataset',
  'Other'
);

CREATE TABLE "StudentPortfolioEvidence" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "origin" "StudentPortfolioEvidenceOrigin" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT '',
  "contribution" TEXT NOT NULL DEFAULT '',
  "startDate" DATE,
  "endDate" DATE,
  "skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "sourceType" "StudentPortfolioEvidenceSourceType",
  "sourceOfferingId" TEXT,
  "sourceCourseSpecId" TEXT,
  "sourceAssessmentItemId" TEXT,
  "sourceLinkedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentPortfolioEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentPortfolioEvidence_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioEvidence_sourceOfferingId_fkey"
    FOREIGN KEY ("sourceOfferingId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioEvidence_sourceAssessmentItem_fkey"
    FOREIGN KEY ("sourceCourseSpecId", "sourceAssessmentItemId")
    REFERENCES "CourseSpecAssessmentItem"("courseSpecId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioEvidence_source_shape_check" CHECK (
    (
      "sourceType" IS NULL
      AND "sourceOfferingId" IS NULL
      AND "sourceCourseSpecId" IS NULL
      AND "sourceAssessmentItemId" IS NULL
      AND "sourceLinkedAt" IS NULL
      AND "origin" <> 'CourseAssessment'
    )
    OR
    (
      "sourceType" = 'CourseAssessment'
      AND "sourceOfferingId" IS NOT NULL
      AND "sourceCourseSpecId" IS NOT NULL
      AND "sourceAssessmentItemId" IS NOT NULL
      AND "sourceLinkedAt" IS NOT NULL
      AND "origin" = 'CourseAssessment'
    )
  ),
  CONSTRAINT "StudentPortfolioEvidence_date_order_check" CHECK (
    "startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate"
  )
);

CREATE TABLE "StudentPortfolioEvidenceLink" (
  "id" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "kind" "StudentPortfolioArtifactKind" NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "url" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentPortfolioEvidenceLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentPortfolioEvidenceLink_evidenceId_fkey"
    FOREIGN KEY ("evidenceId") REFERENCES "StudentPortfolioEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioEvidenceLink_http_url_check" CHECK (
    "url" ~* '^https?://'
  )
);

CREATE INDEX "StudentPortfolioEvidence_studentId_updatedAt_idx"
  ON "StudentPortfolioEvidence"("studentId", "updatedAt");
CREATE INDEX "StudentPortfolioEvidence_studentId_public_featured_idx"
  ON "StudentPortfolioEvidence"("studentId", "isPublic", "isFeatured");
CREATE INDEX "StudentPortfolioEvidence_sourceOfferingId_idx"
  ON "StudentPortfolioEvidence"("sourceOfferingId");
CREATE INDEX "StudentPortfolioEvidence_sourceAssessmentItem_idx"
  ON "StudentPortfolioEvidence"("sourceCourseSpecId", "sourceAssessmentItemId");
CREATE INDEX "StudentPortfolioEvidenceLink_evidenceId_idx"
  ON "StudentPortfolioEvidenceLink"("evidenceId");
CREATE UNIQUE INDEX "StudentPortfolioEvidenceLink_evidenceId_kind_url_key"
  ON "StudentPortfolioEvidenceLink"("evidenceId", "kind", "url");

-- DSE-PMS data stays backend-only. Match the repository security baseline by
-- enabling RLS and removing direct Data API/PUBLIC privileges for both tables.
ALTER TABLE "StudentPortfolioEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentPortfolioEvidenceLink" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "StudentPortfolioEvidence" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "StudentPortfolioEvidenceLink" FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', 'StudentPortfolioEvidence', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', 'StudentPortfolioEvidenceLink', api_role);
  END LOOP;
END
$$;
