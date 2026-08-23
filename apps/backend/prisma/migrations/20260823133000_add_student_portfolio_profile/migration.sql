-- Issue #571: student-owned portfolio profile metadata.
-- This table is presentation-only and does not duplicate or mutate academic records.
CREATE TABLE "StudentPortfolioProfile" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "headline" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "careerInterests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publicSlug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentPortfolioProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentPortfolioProfile_studentId_key"
    ON "StudentPortfolioProfile"("studentId");
CREATE UNIQUE INDEX "StudentPortfolioProfile_publicSlug_key"
    ON "StudentPortfolioProfile"("publicSlug");
CREATE INDEX "StudentPortfolioProfile_isPublic_idx"
    ON "StudentPortfolioProfile"("isPublic");

ALTER TABLE "StudentPortfolioProfile"
    ADD CONSTRAINT "StudentPortfolioProfile_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- DSE-PMS application data is backend-only. Match the repository security baseline:
-- enable RLS and revoke direct Data API access, while the backend direct PostgreSQL
-- connection remains the application authorization boundary.
ALTER TABLE "StudentPortfolioProfile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "StudentPortfolioProfile" FROM PUBLIC;

DO $$
DECLARE
  api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname
    FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
      'public', 'StudentPortfolioProfile', api_role
    );
  END LOOP;
END
$$;
