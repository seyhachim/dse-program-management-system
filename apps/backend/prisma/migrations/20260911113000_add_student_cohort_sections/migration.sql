-- Issue #1039: canonical cohort sections and dated section membership history.
-- This is additive only. Existing cohort/student/academic records are not rewritten
-- or inferred into sections.

CREATE TABLE "StudentCohortSection" (
  "id" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentCohortSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentCohortSection_cohortId_code_key"
  ON "StudentCohortSection"("cohortId", "code");
CREATE UNIQUE INDEX "StudentCohortSection_id_cohortId_key"
  ON "StudentCohortSection"("id", "cohortId");
CREATE INDEX "StudentCohortSection_cohortId_active_idx"
  ON "StudentCohortSection"("cohortId", "active", "code");

ALTER TABLE "StudentCohortSection"
  ADD CONSTRAINT "StudentCohortSection_cohortId_fkey"
  FOREIGN KEY ("cohortId") REFERENCES "StudentCohort"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "StudentCohortSectionMembership" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "joinedAt" DATE NOT NULL,
  "exitedAt" DATE,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentCohortSectionMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentCohortSectionMembership_dates_check"
    CHECK ("exitedAt" IS NULL OR "exitedAt" >= "joinedAt")
);

CREATE UNIQUE INDEX "StudentCohortSectionMembership_section_student_joined_key"
  ON "StudentCohortSectionMembership"("sectionId", "studentId", "joinedAt");
CREATE UNIQUE INDEX "StudentCohortSectionMembership_one_active_per_cohort_student"
  ON "StudentCohortSectionMembership"("cohortId", "studentId")
  WHERE "exitedAt" IS NULL;
CREATE INDEX "StudentCohortSectionMembership_cohort_student_dates_idx"
  ON "StudentCohortSectionMembership"("cohortId", "studentId", "joinedAt", "exitedAt");
CREATE INDEX "StudentCohortSectionMembership_section_dates_idx"
  ON "StudentCohortSectionMembership"("sectionId", "joinedAt", "exitedAt");

ALTER TABLE "StudentCohortSectionMembership"
  ADD CONSTRAINT "StudentCohortSectionMembership_section_cohort_fkey"
  FOREIGN KEY ("sectionId", "cohortId") REFERENCES "StudentCohortSection"("id", "cohortId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentCohortSectionMembership"
  ADD CONSTRAINT "StudentCohortSectionMembership_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prevent an authoritative cohort membership from being closed while the student
-- still has an active section membership in that cohort. Staff must close the
-- section membership explicitly first so section history never silently outlives
-- its parent cohort membership.
CREATE FUNCTION "prevent_cohort_exit_with_active_section"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."exitedAt" IS NULL AND NEW."exitedAt" IS NOT NULL AND EXISTS (
    SELECT 1
    FROM "StudentCohortSectionMembership" section_membership
    WHERE section_membership."cohortId" = OLD."cohortId"
      AND section_membership."studentId" = OLD."studentId"
      AND section_membership."exitedAt" IS NULL
  ) THEN
    RAISE EXCEPTION 'Close the active cohort section membership before closing cohort membership'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "StudentCohortMembership_section_exit_guard"
BEFORE UPDATE OF "exitedAt" ON "StudentCohortMembership"
FOR EACH ROW
EXECUTE FUNCTION "prevent_cohort_exit_with_active_section"();

ALTER TABLE "StudentCohortSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudentCohortSectionMembership" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "StudentCohortSection" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "StudentCohortSectionMembership" FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'StudentCohortSection', api_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'StudentCohortSectionMembership', api_role);
  END LOOP;
END $$;