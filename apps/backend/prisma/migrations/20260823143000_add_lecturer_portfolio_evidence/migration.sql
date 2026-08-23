-- Epic #583: lecturer-owned professional evidence with auditable verification.
-- Current teaching remains authoritative in Course/Offering and is never copied here.
-- This domain intentionally lives outside Prisma's managed public schema, matching
-- other security-sensitive raw-SQL PMS domains and preventing migrate-dev drift.

CREATE SCHEMA IF NOT EXISTS lecturer_portfolio;
REVOKE ALL ON SCHEMA lecturer_portfolio FROM PUBLIC;

CREATE TYPE lecturer_portfolio."LecturerPortfolioItemKind" AS ENUM (
  'Qualification',
  'ResearchInterest',
  'ResearchProject',
  'Publication',
  'ProfessionalDevelopment',
  'Certification',
  'Membership',
  'ExternalProfile',
  'Supervision',
  'AcademicService',
  'Other'
);

CREATE TYPE lecturer_portfolio."LecturerPortfolioVerificationStatus" AS ENUM (
  'SelfDeclared',
  'Verified',
  'Rejected'
);

CREATE TYPE lecturer_portfolio."LecturerPortfolioVerificationAction" AS ENUM (
  'Verified',
  'Rejected',
  'Reset'
);

CREATE TABLE lecturer_portfolio."LecturerPortfolioItem" (
  "id" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "kind" lecturer_portfolio."LecturerPortfolioItemKind" NOT NULL,
  "title" TEXT NOT NULL,
  "organization" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "role" TEXT NOT NULL DEFAULT '',
  "identifier" TEXT NOT NULL DEFAULT '',
  "url" TEXT NOT NULL DEFAULT '',
  "startDate" DATE,
  "endDate" DATE,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "verificationStatus" lecturer_portfolio."LecturerPortfolioVerificationStatus" NOT NULL DEFAULT 'SelfDeclared',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LecturerPortfolioItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LecturerPortfolioItem_lecturerId_fkey"
    FOREIGN KEY ("lecturerId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LecturerPortfolioItem_date_order_check" CHECK (
    "startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate"
  ),
  CONSTRAINT "LecturerPortfolioItem_http_url_check" CHECK (
    "url" = '' OR "url" ~* '^https?://'
  )
);

CREATE TABLE lecturer_portfolio."LecturerPortfolioVerification" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "action" lecturer_portfolio."LecturerPortfolioVerificationAction" NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LecturerPortfolioVerification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LecturerPortfolioVerification_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES lecturer_portfolio."LecturerPortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LecturerPortfolioVerification_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "LecturerPortfolioItem_lecturerId_kind_idx"
  ON lecturer_portfolio."LecturerPortfolioItem"("lecturerId", "kind");
CREATE INDEX "LecturerPortfolioItem_lecturerId_verificationStatus_idx"
  ON lecturer_portfolio."LecturerPortfolioItem"("lecturerId", "verificationStatus");
CREATE INDEX "LecturerPortfolioVerification_itemId_createdAt_idx"
  ON lecturer_portfolio."LecturerPortfolioVerification"("itemId", "createdAt");
CREATE INDEX "LecturerPortfolioVerification_actorId_idx"
  ON lecturer_portfolio."LecturerPortfolioVerification"("actorId");

ALTER TABLE lecturer_portfolio."LecturerPortfolioItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE lecturer_portfolio."LecturerPortfolioVerification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE lecturer_portfolio."LecturerPortfolioItem" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE lecturer_portfolio."LecturerPortfolioVerification" FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA lecturer_portfolio FROM %I', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE lecturer_portfolio.%I FROM %I', 'LecturerPortfolioItem', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE lecturer_portfolio.%I FROM %I', 'LecturerPortfolioVerification', api_role);
  END LOOP;
END
$$;
