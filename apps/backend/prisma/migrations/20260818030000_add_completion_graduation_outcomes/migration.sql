-- Issue #302: append-only completion/graduation outcome evidence.
CREATE TYPE "StudentCompletionOutcomeType" AS ENUM ('ProgrammeCompleted', 'GraduationAwarded');

CREATE TABLE "StudentCompletionOutcome" (
  "id" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "outcomeType" "StudentCompletionOutcomeType" NOT NULL,
  "outcomeDate" DATE NOT NULL,
  "academicYear" TEXT NOT NULL,
  "awardName" TEXT NOT NULL DEFAULT '',
  "note" TEXT NOT NULL DEFAULT '',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentCompletionOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentCompletionOutcome_membershipId_outcomeType_key" ON "StudentCompletionOutcome"("membershipId", "outcomeType");
CREATE INDEX "StudentCompletionOutcome_membershipId_outcomeDate_idx" ON "StudentCompletionOutcome"("membershipId", "outcomeDate");
CREATE INDEX "StudentCompletionOutcome_outcomeType_academicYear_outcomeDate_idx" ON "StudentCompletionOutcome"("outcomeType", "academicYear", "outcomeDate");
ALTER TABLE "StudentCompletionOutcome" ADD CONSTRAINT "StudentCompletionOutcome_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "StudentCohortMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION validate_student_completion_outcome() RETURNS trigger AS $$
DECLARE
  joined_date date;
  completion_date date;
BEGIN
  SELECT "joinedAt" INTO joined_date FROM "StudentCohortMembership" WHERE id = NEW."membershipId";
  IF joined_date IS NULL THEN RAISE EXCEPTION 'Cohort membership not found'; END IF;
  IF NEW."outcomeDate" < joined_date THEN RAISE EXCEPTION 'Completion outcome cannot predate cohort membership'; END IF;
  IF NEW."outcomeType" = 'GraduationAwarded' THEN
    SELECT "outcomeDate" INTO completion_date FROM "StudentCompletionOutcome"
      WHERE "membershipId" = NEW."membershipId" AND "outcomeType" = 'ProgrammeCompleted';
    IF completion_date IS NULL THEN RAISE EXCEPTION 'Graduation award requires a programme completion record'; END IF;
    IF NEW."outcomeDate" < completion_date THEN RAISE EXCEPTION 'Graduation award cannot predate programme completion'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION validate_student_completion_outcome() FROM PUBLIC;

CREATE OR REPLACE FUNCTION prevent_student_completion_outcome_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Completion/graduation outcome history is append-only';
END;
$$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prevent_student_completion_outcome_rewrite() FROM PUBLIC;

DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.validate_student_completion_outcome() FROM %I', api_role);
    EXECUTE format('REVOKE ALL ON FUNCTION public.prevent_student_completion_outcome_rewrite() FROM %I', api_role);
  END LOOP;
END $$;

CREATE TRIGGER "StudentCompletionOutcome_validate" BEFORE INSERT ON "StudentCompletionOutcome" FOR EACH ROW EXECUTE FUNCTION validate_student_completion_outcome();
CREATE TRIGGER "StudentCompletionOutcome_no_update" BEFORE UPDATE ON "StudentCompletionOutcome" FOR EACH ROW EXECUTE FUNCTION prevent_student_completion_outcome_rewrite();
CREATE TRIGGER "StudentCompletionOutcome_no_delete" BEFORE DELETE ON "StudentCompletionOutcome" FOR EACH ROW EXECUTE FUNCTION prevent_student_completion_outcome_rewrite();

ALTER TABLE "StudentCompletionOutcome" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "StudentCompletionOutcome" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'StudentCompletionOutcome', api_role);
  END LOOP;
END $$;
