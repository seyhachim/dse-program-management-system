-- Issues #572, #574, #575 and #578: remaining Student Portfolio persistence.
-- This migration is additive. Portfolio tables remain a presentation/evidence layer
-- and never become authoritative for assessment, CLO/PLO, CourseSpec or result data.

CREATE TYPE "StudentPortfolioProfessionalProvider" AS ENUM (
  'GitHub', 'GitLab', 'LinkedIn', 'Kaggle', 'HuggingFace', 'Website',
  'ORCID', 'GoogleScholar', 'ResearchGate', 'CodingPractice', 'BIProfile', 'CV', 'Other'
);

CREATE TYPE "StudentPortfolioSupervisorStatus" AS ENUM ('Pending', 'Approved', 'Revoked');
CREATE TYPE "StudentPortfolioVerificationState" AS ENUM ('Unverified', 'Verified', 'NeedsChanges', 'Revoked');
CREATE TYPE "StudentPortfolioVerificationContext" AS ENUM ('Lecturer', 'Supervisor', 'System');

CREATE TABLE "StudentPortfolioProfessionalLink" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "provider" "StudentPortfolioProfessionalProvider" NOT NULL,
  "label" TEXT NOT NULL DEFAULT '',
  "url" TEXT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentPortfolioProfessionalLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentPortfolioProfessionalLink_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioProfessionalLink_http_url_check" CHECK ("url" ~* '^https?://')
);

CREATE UNIQUE INDEX "StudentPortfolioProfessionalLink_student_provider_url_key"
  ON "StudentPortfolioProfessionalLink"("studentId", "provider", "url");
CREATE INDEX "StudentPortfolioProfessionalLink_student_public_idx"
  ON "StudentPortfolioProfessionalLink"("studentId", "isPublic");

CREATE TABLE "StudentPortfolioSupervisorRelationship" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "supervisorUserId" TEXT NOT NULL,
  "status" "StudentPortfolioSupervisorStatus" NOT NULL DEFAULT 'Pending',
  "approvedById" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "revokedById" TEXT,
  "revokedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentPortfolioSupervisorRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentPortfolioSupervisorRelationship_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioSupervisorRelationship_supervisorUserId_fkey"
    FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioSupervisorRelationship_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioSupervisorRelationship_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioSupervisorRelationship_state_check" CHECK (
    ("status" = 'Pending' AND "approvedAt" IS NULL AND "revokedAt" IS NULL)
    OR ("status" = 'Approved' AND "approvedAt" IS NOT NULL AND "revokedAt" IS NULL)
    OR ("status" = 'Revoked' AND "approvedAt" IS NOT NULL AND "revokedAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "StudentPortfolioSupervisorRelationship_student_supervisor_key"
  ON "StudentPortfolioSupervisorRelationship"("studentId", "supervisorUserId");
CREATE INDEX "StudentPortfolioSupervisorRelationship_supervisor_status_idx"
  ON "StudentPortfolioSupervisorRelationship"("supervisorUserId", "status");

CREATE TABLE "StudentPortfolioVerificationEvent" (
  "id" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorContext" "StudentPortfolioVerificationContext" NOT NULL,
  "previousState" "StudentPortfolioVerificationState" NOT NULL,
  "newState" "StudentPortfolioVerificationState" NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "snapshot" JSONB NOT NULL,
  "snapshotHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentPortfolioVerificationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentPortfolioVerificationEvent_evidenceId_fkey"
    FOREIGN KEY ("evidenceId") REFERENCES "StudentPortfolioEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioVerificationEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioVerificationEvent_actor_shape_check" CHECK (
    ("actorContext" = 'System' AND "actorId" IS NULL)
    OR ("actorContext" <> 'System' AND "actorId" IS NOT NULL)
  )
);
CREATE INDEX "StudentPortfolioVerificationEvent_evidence_created_idx"
  ON "StudentPortfolioVerificationEvent"("evidenceId", "createdAt");
CREATE INDEX "StudentPortfolioVerificationEvent_actor_created_idx"
  ON "StudentPortfolioVerificationEvent"("actorId", "createdAt");

CREATE TABLE "StudentPortfolioEvidenceSoftSkill" (
  "evidenceId" TEXT NOT NULL,
  "skillCode" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentPortfolioEvidenceSoftSkill_pkey" PRIMARY KEY ("evidenceId", "skillCode"),
  CONSTRAINT "StudentPortfolioEvidenceSoftSkill_evidenceId_fkey"
    FOREIGN KEY ("evidenceId") REFERENCES "StudentPortfolioEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentPortfolioEvidenceSoftSkill_code_check" CHECK (
    "skillCode" IN ('teamwork','communication','leadership','problem_solving','presentation','professionalism','adaptability','time_management')
  )
);
CREATE INDEX "StudentPortfolioEvidenceSoftSkill_skill_idx"
  ON "StudentPortfolioEvidenceSoftSkill"("skillCode");

-- Verification history is append-only. Corrections are new transitions, never edits/deletes.
CREATE OR REPLACE FUNCTION reject_student_portfolio_verification_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Student portfolio verification history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "StudentPortfolioVerificationEvent_no_update"
BEFORE UPDATE ON "StudentPortfolioVerificationEvent"
FOR EACH ROW EXECUTE FUNCTION reject_student_portfolio_verification_mutation();

CREATE TRIGGER "StudentPortfolioVerificationEvent_no_delete"
BEFORE DELETE ON "StudentPortfolioVerificationEvent"
FOR EACH ROW EXECUTE FUNCTION reject_student_portfolio_verification_mutation();

ALTER TABLE "StudentPortfolioProfessionalLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentPortfolioSupervisorRelationship" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentPortfolioVerificationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentPortfolioEvidenceSoftSkill" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE "StudentPortfolioProfessionalLink" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "StudentPortfolioSupervisorRelationship" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "StudentPortfolioVerificationEvent" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "StudentPortfolioEvidenceSoftSkill" FROM PUBLIC;

DO $$
DECLARE
  api_role text;
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'StudentPortfolioProfessionalLink',
    'StudentPortfolioSupervisorRelationship',
    'StudentPortfolioVerificationEvent',
    'StudentPortfolioEvidenceSoftSkill'
  ]
  LOOP
    FOR api_role IN
      SELECT rolname FROM pg_roles
      WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', table_name, api_role);
    END LOOP;
  END LOOP;
END
$$;