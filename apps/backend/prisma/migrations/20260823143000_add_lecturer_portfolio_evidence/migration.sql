-- Epic #583: lecturer-owned professional evidence with auditable verification.
-- Current teaching remains authoritative in Course/Offering and is never copied here.

CREATE TYPE "LecturerPortfolioItemKind" AS ENUM (
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

CREATE TYPE "LecturerPortfolioVerificationStatus" AS ENUM (
  'SelfDeclared',
  'Verified',
  'Rejected'
);

CREATE TYPE "LecturerPortfolioVerificationAction" AS ENUM (
  'Verified',
  'Rejected',
  'Reset'
);

CREATE TABLE "LecturerPortfolioItem" (
  "id" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "kind" "LecturerPortfolioItemKind" NOT NULL,
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
  "verificationStatus" "LecturerPortfolioVerificationStatus" NOT NULL DEFAULT 'SelfDeclared',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LecturerPortfolioItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LecturerPortfolioItem_lecturerId_fkey"
    FOREIGN KEY ("lecturerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LecturerPortfolioItem_date_order_check" CHECK (
    "startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate"
  ),
  CONSTRAINT "LecturerPortfolioItem_http_url_check" CHECK (
    "url" = '' OR "url" ~* '^https?://'
  )
);

CREATE TABLE "LecturerPortfolioVerification" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "action" "LecturerPortfolioVerificationAction" NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LecturerPortfolioVerification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LecturerPortfolioVerification_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "LecturerPortfolioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LecturerPortfolioVerification_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "LecturerPortfolioItem_lecturerId_kind_idx"
  ON "LecturerPortfolioItem"("lecturerId", "kind");
CREATE INDEX "LecturerPortfolioItem_lecturerId_verificationStatus_idx"
  ON "LecturerPortfolioItem"("lecturerId", "verificationStatus");
CREATE INDEX "LecturerPortfolioVerification_itemId_createdAt_idx"
  ON "LecturerPortfolioVerification"("itemId", "createdAt");
CREATE INDEX "LecturerPortfolioVerification_actorId_idx"
  ON "LecturerPortfolioVerification"("actorId");

-- Portfolio evidence is backend-only and private by default. Match the repository
-- security baseline: enable RLS and revoke direct Data API/PUBLIC privileges.
ALTER TABLE "LecturerPortfolioItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LecturerPortfolioVerification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "LecturerPortfolioItem" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "LecturerPortfolioVerification" FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', 'LecturerPortfolioItem', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM %I', 'LecturerPortfolioVerification', api_role);
  END LOOP;
END
$$;
