-- Exact curriculum-placement provenance for Course Offerings.
--
-- This is intentionally migration-owned in a protected schema rather than a
-- Prisma public model. Offerings keep their existing canonical public row while
-- this protected one-to-one record pins the exact approved/active/superseded
-- curriculum placement that authorized delivery. Historical offerings are not
-- guessed or backfilled.

CREATE SCHEMA IF NOT EXISTS offering_governance;

REVOKE ALL ON SCHEMA offering_governance FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA offering_governance
  REVOKE ALL ON TABLES FROM PUBLIC;

CREATE TABLE offering_governance."OfferingCurriculumBinding" (
  "offeringId" TEXT NOT NULL,
  "curriculumCourseId" TEXT NOT NULL,
  "curriculumVersionId" TEXT NOT NULL,
  "boundByUserId" TEXT NOT NULL,
  "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedByUserId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfferingCurriculumBinding_pkey" PRIMARY KEY ("offeringId"),
  CONSTRAINT "OfferingCurriculumBinding_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES public."Offering"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OfferingCurriculumBinding_curriculumCourseId_fkey"
    FOREIGN KEY ("curriculumCourseId") REFERENCES public."ProgrammeCurriculumCourse"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingCurriculumBinding_curriculumVersionId_fkey"
    FOREIGN KEY ("curriculumVersionId") REFERENCES public."ProgrammeCurriculumVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingCurriculumBinding_boundByUserId_fkey"
    FOREIGN KEY ("boundByUserId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OfferingCurriculumBinding_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES public."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "OfferingCurriculumBinding_curriculumCourseId_idx"
  ON offering_governance."OfferingCurriculumBinding"("curriculumCourseId");
CREATE INDEX "OfferingCurriculumBinding_curriculumVersionId_idx"
  ON offering_governance."OfferingCurriculumBinding"("curriculumVersionId");

ALTER TABLE offering_governance."OfferingCurriculumBinding" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA offering_governance FROM PUBLIC;

-- Local/integration PostgreSQL may not define Supabase Data API roles. Revoke
-- them conditionally so the same migration is safe in CI/local and Supabase.
DO $offering_governance_roles$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA offering_governance FROM %I', role_name);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA offering_governance REVOKE ALL ON TABLES FROM %I',
        role_name
      );
      EXECUTE format(
        'REVOKE ALL ON ALL TABLES IN SCHEMA offering_governance FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$offering_governance_roles$;
