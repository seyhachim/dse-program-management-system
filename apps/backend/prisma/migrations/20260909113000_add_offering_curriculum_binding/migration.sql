-- Exact curriculum-placement provenance for Course Offerings.
--
-- This is intentionally migration-owned in a protected schema rather than a
-- Prisma public model. Offerings keep their existing canonical public row while
-- this protected one-to-one record pins the exact approved/active/superseded
-- curriculum placement that authorized delivery. Historical offerings are not
-- guessed or backfilled.

CREATE SCHEMA IF NOT EXISTS offering_governance;

REVOKE ALL ON SCHEMA offering_governance FROM PUBLIC;
REVOKE ALL ON SCHEMA offering_governance FROM anon;
REVOKE ALL ON SCHEMA offering_governance FROM authenticated;
REVOKE ALL ON SCHEMA offering_governance FROM service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA offering_governance
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA offering_governance
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA offering_governance
  REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA offering_governance
  REVOKE ALL ON TABLES FROM service_role;

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
REVOKE ALL ON ALL TABLES IN SCHEMA offering_governance FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA offering_governance FROM authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA offering_governance FROM service_role;
