-- Issue #304: immutable, versioned programme outcome indicators.
CREATE TYPE "ProgrammeOutcomeIndicatorType" AS ENUM ('ProgressionRate','RetentionRate','CompletionRate','DropoutRate','CloAttainmentRate','PloAttainmentRate');
CREATE TABLE "ProgrammeOutcomeIndicator" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "cohortId" TEXT NOT NULL,
  "indicatorType" "ProgrammeOutcomeIndicatorType" NOT NULL,
  "academicYear" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "numerator" INTEGER NOT NULL,
  "denominator" INTEGER NOT NULL,
  "value" DOUBLE PRECISION,
  "definitionVersion" TEXT NOT NULL,
  "definition" JSONB NOT NULL,
  "definitionHash" TEXT NOT NULL,
  "calculationVersion" TEXT NOT NULL,
  "sourceRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "calculationHash" TEXT NOT NULL,
  "supersedesIndicatorId" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeOutcomeIndicator_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProgrammeOutcomeIndicator_counts" CHECK ("numerator" >= 0 AND "denominator" >= 0 AND "numerator" <= "denominator"),
  CONSTRAINT "ProgrammeOutcomeIndicator_value" CHECK (("denominator" = 0 AND "value" IS NULL) OR ("denominator" > 0 AND "value" >= 0 AND "value" <= 100)),
  CONSTRAINT "ProgrammeOutcomeIndicator_sources" CHECK (cardinality("sourceRefs") > 0)
);
CREATE UNIQUE INDEX "ProgrammeOutcomeIndicator_calculationHash_key" ON "ProgrammeOutcomeIndicator"("calculationHash");
CREATE INDEX "ProgrammeOutcomeIndicator_programmeId_indicatorType_academicYear_idx" ON "ProgrammeOutcomeIndicator"("programmeId","indicatorType","academicYear");
CREATE INDEX "ProgrammeOutcomeIndicator_cohortId_indicatorType_periodKey_idx" ON "ProgrammeOutcomeIndicator"("cohortId","indicatorType","periodKey");
CREATE INDEX "ProgrammeOutcomeIndicator_definitionHash_periodKey_idx" ON "ProgrammeOutcomeIndicator"("definitionHash","periodKey");
CREATE INDEX "ProgrammeOutcomeIndicator_supersedesIndicatorId_idx" ON "ProgrammeOutcomeIndicator"("supersedesIndicatorId");
ALTER TABLE "ProgrammeOutcomeIndicator" ADD CONSTRAINT "ProgrammeOutcomeIndicator_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammeOutcomeIndicator" ADD CONSTRAINT "ProgrammeOutcomeIndicator_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "StudentCohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgrammeOutcomeIndicator" ADD CONSTRAINT "ProgrammeOutcomeIndicator_supersedesIndicatorId_fkey" FOREIGN KEY ("supersedesIndicatorId") REFERENCES "ProgrammeOutcomeIndicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_programme_outcome_indicator_rewrite() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Programme outcome indicators are immutable; create a superseding indicator instead'; END;
$$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prevent_programme_outcome_indicator_rewrite() FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.prevent_programme_outcome_indicator_rewrite() FROM %I', api_role);
  END LOOP;
END $$;
CREATE TRIGGER "ProgrammeOutcomeIndicator_no_update" BEFORE UPDATE ON "ProgrammeOutcomeIndicator" FOR EACH ROW EXECUTE FUNCTION prevent_programme_outcome_indicator_rewrite();
CREATE TRIGGER "ProgrammeOutcomeIndicator_no_delete" BEFORE DELETE ON "ProgrammeOutcomeIndicator" FOR EACH ROW EXECUTE FUNCTION prevent_programme_outcome_indicator_rewrite();
ALTER TABLE "ProgrammeOutcomeIndicator" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "ProgrammeOutcomeIndicator" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'ProgrammeOutcomeIndicator', api_role);
  END LOOP;
END $$;
