-- Issue #301: authoritative programme cohort membership and progression history.
-- These records are explicit institutional evidence; nothing is inferred from attendance/enrolment.

CREATE TYPE "StudentCohortStatus" AS ENUM ('Planned', 'Active', 'Completed', 'Archived');
CREATE TYPE "StudentCohortMembershipExitReason" AS ENUM ('Withdrawn', 'Transferred', 'Graduated', 'Other');
CREATE TYPE "StudentProgressionStatus" AS ENUM ('Progressed', 'Retained', 'Withdrawn', 'Inactive', 'Graduated', 'Transferred');

CREATE TABLE "StudentCohort" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "intakeYear" INTEGER NOT NULL,
  "expectedGraduationYear" INTEGER NOT NULL,
  "status" "StudentCohortStatus" NOT NULL DEFAULT 'Active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentCohort_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentCohort_graduation_after_intake" CHECK ("expectedGraduationYear" >= "intakeYear")
);

CREATE TABLE "StudentCohortMembership" (
  "id" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "joinedAt" DATE NOT NULL,
  "exitedAt" DATE,
  "exitReason" "StudentCohortMembershipExitReason",
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentCohortMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentCohortMembership_exit_after_join" CHECK ("exitedAt" IS NULL OR "exitedAt" >= "joinedAt"),
  CONSTRAINT "StudentCohortMembership_exit_reason_consistent" CHECK (("exitedAt" IS NULL AND "exitReason" IS NULL) OR ("exitedAt" IS NOT NULL AND "exitReason" IS NOT NULL))
);

CREATE TABLE "StudentProgressionRecord" (
  "id" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "term" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "status" "StudentProgressionStatus" NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentProgressionRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentProgressionRecord_valid_period" CHECK ("periodEnd" >= "periodStart")
);

CREATE UNIQUE INDEX "StudentCohort_programmeId_code_key" ON "StudentCohort"("programmeId", "code");
CREATE INDEX "StudentCohort_programmeId_intakeYear_status_idx" ON "StudentCohort"("programmeId", "intakeYear", "status");
CREATE UNIQUE INDEX "StudentCohortMembership_cohortId_studentId_joinedAt_key" ON "StudentCohortMembership"("cohortId", "studentId", "joinedAt");
CREATE INDEX "StudentCohortMembership_studentId_joinedAt_idx" ON "StudentCohortMembership"("studentId", "joinedAt");
CREATE INDEX "StudentCohortMembership_cohortId_joinedAt_exitedAt_idx" ON "StudentCohortMembership"("cohortId", "joinedAt", "exitedAt");
CREATE UNIQUE INDEX "StudentProgressionRecord_membershipId_academicYear_term_key" ON "StudentProgressionRecord"("membershipId", "academicYear", "term");
CREATE INDEX "StudentProgressionRecord_membershipId_periodStart_idx" ON "StudentProgressionRecord"("membershipId", "periodStart");
CREATE INDEX "StudentProgressionRecord_academicYear_term_status_idx" ON "StudentProgressionRecord"("academicYear", "term", "status");

ALTER TABLE "StudentCohort" ADD CONSTRAINT "StudentCohort_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentCohortMembership" ADD CONSTRAINT "StudentCohortMembership_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "StudentCohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentCohortMembership" ADD CONSTRAINT "StudentCohortMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentProgressionRecord" ADD CONSTRAINT "StudentProgressionRecord_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "StudentCohortMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_overlapping_student_cohort_memberships() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "StudentCohortMembership" existing
    WHERE existing."studentId" = NEW."studentId"
      AND existing.id <> NEW.id
      AND daterange(existing."joinedAt", COALESCE(existing."exitedAt" + 1, 'infinity'::date), '[)')
          && daterange(NEW."joinedAt", COALESCE(NEW."exitedAt" + 1, 'infinity'::date), '[)')
  ) THEN
    RAISE EXCEPTION 'Student cohort memberships cannot overlap';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StudentCohortMembership_no_overlap" BEFORE INSERT OR UPDATE ON "StudentCohortMembership" FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_student_cohort_memberships();

CREATE OR REPLACE FUNCTION protect_student_cohort_membership_history() RETURNS trigger AS $$
BEGIN
  IF OLD."cohortId" <> NEW."cohortId" OR OLD."studentId" <> NEW."studentId" OR OLD."joinedAt" <> NEW."joinedAt" THEN
    RAISE EXCEPTION 'Cohort membership identity is immutable';
  END IF;
  IF OLD."exitedAt" IS NOT NULL AND (NEW."exitedAt" IS DISTINCT FROM OLD."exitedAt" OR NEW."exitReason" IS DISTINCT FROM OLD."exitReason") THEN
    RAISE EXCEPTION 'Closed cohort membership cannot be rewritten';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StudentCohortMembership_history_guard" BEFORE UPDATE ON "StudentCohortMembership" FOR EACH ROW EXECUTE FUNCTION protect_student_cohort_membership_history();

CREATE OR REPLACE FUNCTION validate_progression_membership_period() RETURNS trigger AS $$
DECLARE m "StudentCohortMembership"%ROWTYPE;
BEGIN
  SELECT * INTO m FROM "StudentCohortMembership" WHERE id = NEW."membershipId";
  IF NOT FOUND THEN RAISE EXCEPTION 'Cohort membership not found'; END IF;
  IF NEW."periodStart" < m."joinedAt" OR (m."exitedAt" IS NOT NULL AND NEW."periodEnd" > m."exitedAt") THEN
    RAISE EXCEPTION 'Progression period must fall within cohort membership dates';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StudentProgressionRecord_membership_period" BEFORE INSERT ON "StudentProgressionRecord" FOR EACH ROW EXECUTE FUNCTION validate_progression_membership_period();

CREATE OR REPLACE FUNCTION prevent_student_progression_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Student progression history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StudentProgressionRecord_no_update" BEFORE UPDATE ON "StudentProgressionRecord" FOR EACH ROW EXECUTE FUNCTION prevent_student_progression_rewrite();
CREATE TRIGGER "StudentProgressionRecord_no_delete" BEFORE DELETE ON "StudentProgressionRecord" FOR EACH ROW EXECUTE FUNCTION prevent_student_progression_rewrite();

DO $$
DECLARE table_name text; api_role text; tables constant text[] := ARRAY['StudentCohort','StudentCohortMembership','StudentProgressionRecord'];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
  END LOOP;
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    FOREACH table_name IN ARRAY tables LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', table_name, api_role);
    END LOOP;
  END LOOP;
END $$;
