-- #1298 Independent annual submission review; preserve previous snapshots.
ALTER TABLE lecturer_annual."AnnualSubmission"
  ADD COLUMN "revision" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE TABLE lecturer_annual."AnnualSubmissionReviewEvent" (
  "id" TEXT PRIMARY KEY,
  "academicYearId" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL CHECK ("fingerprint" ~ '^[a-f0-9]{64}$'),
  "decision" TEXT NOT NULL CHECK ("decision" IN ('verified','needs_changes')),
  "reason" TEXT NOT NULL CHECK (length(trim("reason")) >= 5),
  "actorId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "reviewedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("actorId" <> "lecturerId"),
  FOREIGN KEY ("academicYearId","lecturerId")
    REFERENCES lecturer_annual."AnnualSubmission"("academicYearId","lecturerId") ON DELETE RESTRICT
);
CREATE INDEX "AnnualSubmissionReviewEvent_year_lecturer"
  ON lecturer_annual."AnnualSubmissionReviewEvent" ("academicYearId","lecturerId","reviewedAt");
CREATE TRIGGER "AnnualSubmissionReviewEvent_immutable" BEFORE UPDATE OR DELETE
  ON lecturer_annual."AnnualSubmissionReviewEvent" FOR EACH ROW
  EXECUTE FUNCTION lecturer_annual."reject_append_only_mutation"();
ALTER TABLE lecturer_annual."AnnualSubmissionReviewEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE lecturer_annual."AnnualSubmissionReviewEvent" FROM PUBLIC;
DO $annual_review$
DECLARE r TEXT;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname=ANY(ARRAY['anon','authenticated','service_role'])
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE lecturer_annual.%I FROM %I','AnnualSubmissionReviewEvent',r);
  END LOOP;
END $annual_review$;
