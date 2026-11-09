-- #1298 Annual lecturer reporting. New private schema; no changes to canonical Offerings
-- or previously reviewed Lecturer Portfolio evidence.
CREATE SCHEMA IF NOT EXISTS lecturer_annual;
REVOKE ALL ON SCHEMA lecturer_annual FROM PUBLIC;

CREATE TABLE lecturer_annual."AnnualSubmission" (
  "academicYearId" TEXT NOT NULL REFERENCES public."AcademicYear"("id") ON DELETE RESTRICT,
  "lecturerId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "note" TEXT NOT NULL DEFAULT '',
  "submittedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("academicYearId", "lecturerId")
);

CREATE TABLE lecturer_annual."AnnualTeachingReview" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "academicYearId" TEXT NOT NULL REFERENCES public."AcademicYear"("id") ON DELETE RESTRICT,
  "offeringId" TEXT NOT NULL REFERENCES public."Offering"("id") ON DELETE RESTRICT,
  "lecturerId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "verdict" TEXT NOT NULL CHECK ("verdict" IN ('confirmed', 'not_delivered')),
  "evidenceUrl" TEXT NOT NULL DEFAULT '' CHECK ("evidenceUrl" = '' OR "evidenceUrl" ~* '^https?://'),
  "reason" TEXT NOT NULL,
  "reviewedById" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "reviewedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("academicYearId", "offeringId", "lecturerId")
);

CREATE TABLE lecturer_annual."AnnualTeachingReviewEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reviewId" TEXT NOT NULL REFERENCES lecturer_annual."AnnualTeachingReview"("id") ON DELETE RESTRICT,
  "previousVerdict" TEXT,
  "newVerdict" TEXT NOT NULL CHECK ("newVerdict" IN ('confirmed', 'not_delivered')),
  "reason" TEXT NOT NULL,
  "evidenceUrl" TEXT NOT NULL DEFAULT '',
  "actorId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lecturer_annual."AnnualEvidenceLink" (
  "academicYearId" TEXT NOT NULL REFERENCES public."AcademicYear"("id") ON DELETE RESTRICT,
  "lecturerId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "itemId" TEXT NOT NULL REFERENCES lecturer_portfolio."LecturerPortfolioItem"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("academicYearId", "itemId")
);
CREATE INDEX "AnnualEvidenceLink_year_lecturer" ON lecturer_annual."AnnualEvidenceLink" ("academicYearId","lecturerId");

CREATE TABLE lecturer_annual."AnnualReportRelease" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "academicYearId" TEXT NOT NULL REFERENCES public."AcademicYear"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "summary" JSONB NOT NULL,
  "createdById" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("academicYearId", "version")
);

-- Annual evidence must belong to the referenced lecturer, even for privileged DB writers.
CREATE FUNCTION lecturer_annual."validate_evidence_owner"()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, lecturer_annual, lecturer_portfolio
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM lecturer_portfolio."LecturerPortfolioItem" p
    WHERE p."id" = NEW."itemId" AND p."lecturerId" = NEW."lecturerId"
  ) THEN
    RAISE EXCEPTION 'Annual evidence must belong to the lecturer';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER "AnnualEvidenceLink_owner_check" BEFORE INSERT OR UPDATE
ON lecturer_annual."AnnualEvidenceLink" FOR EACH ROW
EXECUTE FUNCTION lecturer_annual."validate_evidence_owner"();

-- Events and released annual reports are immutable. Corrections get new events/versions.
CREATE FUNCTION lecturer_annual."reject_append_only_mutation"()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, lecturer_annual
AS $$
BEGIN
  RAISE EXCEPTION 'Annual reporting audit/release records are append-only';
END; $$;
CREATE TRIGGER "AnnualTeachingEvent_immutable" BEFORE UPDATE OR DELETE
ON lecturer_annual."AnnualTeachingReviewEvent" FOR EACH ROW
EXECUTE FUNCTION lecturer_annual."reject_append_only_mutation"();
CREATE TRIGGER "AnnualReportRelease_immutable" BEFORE UPDATE OR DELETE
ON lecturer_annual."AnnualReportRelease" FOR EACH ROW
EXECUTE FUNCTION lecturer_annual."reject_append_only_mutation"();

DO $$
DECLARE
  t TEXT;
  role_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['AnnualSubmission','AnnualTeachingReview','AnnualTeachingReviewEvent','AnnualEvidenceLink','AnnualReportRelease']
  LOOP
    EXECUTE format('ALTER TABLE lecturer_annual.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE lecturer_annual.%I FROM PUBLIC', t);
    FOR role_name IN SELECT rolname FROM pg_roles
      WHERE rolname = ANY(ARRAY['anon','authenticated','service_role'])
    LOOP
      EXECUTE format('REVOKE ALL ON SCHEMA lecturer_annual FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON TABLE lecturer_annual.%I FROM %I', t, role_name);
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION lecturer_annual."validate_evidence_owner"() FROM PUBLIC;
REVOKE ALL ON FUNCTION lecturer_annual."reject_append_only_mutation"() FROM PUBLIC;