-- Issue #540: support roster records before account provisioning and preserve
-- source-supported bilingual identity without overloading the core Student row.

ALTER TABLE "Student" ALTER COLUMN "email" DROP NOT NULL;

CREATE TABLE "StudentProfile" (
  "id" TEXT NOT NULL,
  "studentRecordId" TEXT NOT NULL,
  "khmerFamilyName" TEXT,
  "khmerGivenName" TEXT,
  "latinFamilyName" TEXT,
  "latinGivenName" TEXT,
  "gender" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentProfile_studentRecordId_key" ON "StudentProfile"("studentRecordId");
CREATE INDEX "StudentProfile_gender_idx" ON "StudentProfile"("gender");

ALTER TABLE "StudentProfile"
  ADD CONSTRAINT "StudentProfile_studentRecordId_fkey"
  FOREIGN KEY ("studentRecordId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentProfile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "StudentProfile" FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'StudentProfile', api_role);
  END LOOP;
END $$;
