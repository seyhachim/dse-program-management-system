-- Issue #303: immutable versioned CLO-attainment snapshots.
CREATE TABLE "QaCloAttainmentSnapshot" (
  "id" TEXT NOT NULL,
  "programmeId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "cloId" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "cloCode" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "calculationVersion" TEXT NOT NULL,
  "thresholdPercentage" DOUBLE PRECISION NOT NULL,
  "thresholdRule" JSONB NOT NULL,
  "populationSize" INTEGER NOT NULL,
  "studentCount" INTEGER NOT NULL,
  "achievedCount" INTEGER NOT NULL,
  "achievedRate" DOUBLE PRECISION,
  "sourceAssessmentItemIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceAssessmentResultIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceCriterionScoreIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceMappingKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceEvidence" JSONB NOT NULL,
  "calculationHash" TEXT NOT NULL,
  "supersedesSnapshotId" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QaCloAttainmentSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QaCloAttainmentSnapshot_threshold_range" CHECK ("thresholdPercentage" >= 0 AND "thresholdPercentage" <= 100),
  CONSTRAINT "QaCloAttainmentSnapshot_count_bounds" CHECK ("populationSize" >= 0 AND "studentCount" >= 0 AND "achievedCount" >= 0 AND "studentCount" <= "populationSize" AND "achievedCount" <= "studentCount"),
  CONSTRAINT "QaCloAttainmentSnapshot_rate_range" CHECK ("achievedRate" IS NULL OR ("achievedRate" >= 0 AND "achievedRate" <= 100)),
  CONSTRAINT "QaCloAttainmentSnapshot_empty_rate" CHECK (("studentCount" = 0 AND "achievedRate" IS NULL) OR "studentCount" > 0)
);

CREATE UNIQUE INDEX "QaCloAttainmentSnapshot_identity_hash_key" ON "QaCloAttainmentSnapshot"("offeringId", "courseSpecId", "cloId", "calculationVersion", "calculationHash");
CREATE INDEX "QaCloAttainmentSnapshot_programmeId_periodKey_idx" ON "QaCloAttainmentSnapshot"("programmeId", "periodKey");
CREATE INDEX "QaCloAttainmentSnapshot_courseId_courseSpecId_idx" ON "QaCloAttainmentSnapshot"("courseId", "courseSpecId");
CREATE INDEX "QaCloAttainmentSnapshot_offeringId_cloCode_generatedAt_idx" ON "QaCloAttainmentSnapshot"("offeringId", "cloCode", "generatedAt");
CREATE INDEX "QaCloAttainmentSnapshot_courseSpecId_cloId_idx" ON "QaCloAttainmentSnapshot"("courseSpecId", "cloId");
CREATE INDEX "QaCloAttainmentSnapshot_supersedesSnapshotId_idx" ON "QaCloAttainmentSnapshot"("supersedesSnapshotId");

ALTER TABLE "QaCloAttainmentSnapshot" ADD CONSTRAINT "QaCloAttainmentSnapshot_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaCloAttainmentSnapshot" ADD CONSTRAINT "QaCloAttainmentSnapshot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaCloAttainmentSnapshot" ADD CONSTRAINT "QaCloAttainmentSnapshot_courseSpecId_cloId_fkey" FOREIGN KEY ("courseSpecId", "cloId") REFERENCES "CourseSpecClo"("courseSpecId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaCloAttainmentSnapshot" ADD CONSTRAINT "QaCloAttainmentSnapshot_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QaCloAttainmentSnapshot" ADD CONSTRAINT "QaCloAttainmentSnapshot_supersedesSnapshotId_fkey" FOREIGN KEY ("supersedesSnapshotId") REFERENCES "QaCloAttainmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_clo_attainment_snapshot_rewrite() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CLO attainment snapshots are immutable; create a superseding snapshot instead';
END;
$$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION prevent_clo_attainment_snapshot_rewrite() FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.prevent_clo_attainment_snapshot_rewrite() FROM %I', api_role);
  END LOOP;
END $$;
CREATE TRIGGER "QaCloAttainmentSnapshot_no_update" BEFORE UPDATE ON "QaCloAttainmentSnapshot" FOR EACH ROW EXECUTE FUNCTION prevent_clo_attainment_snapshot_rewrite();
CREATE TRIGGER "QaCloAttainmentSnapshot_no_delete" BEFORE DELETE ON "QaCloAttainmentSnapshot" FOR EACH ROW EXECUTE FUNCTION prevent_clo_attainment_snapshot_rewrite();

ALTER TABLE "QaCloAttainmentSnapshot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "QaCloAttainmentSnapshot" FROM PUBLIC;
DO $$ DECLARE api_role text; BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon','authenticated','service_role']) LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', 'QaCloAttainmentSnapshot', api_role);
  END LOOP;
END $$;
