-- #1298: Explicit reporting-window provenance and historical staffing records.
-- Separate additive migration; no changes to the original annual migration or source Offerings.
CREATE TABLE lecturer_annual."AnnualReportingWindow" (
  "academicYearId" TEXT NOT NULL PRIMARY KEY REFERENCES public."AcademicYear"("id") ON DELETE RESTRICT,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "evidenceUrl" TEXT NOT NULL DEFAULT '' CHECK ("evidenceUrl" = '' OR "evidenceUrl" ~* '^https?://'),
  "reason" TEXT NOT NULL,
  "reviewedById" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "reviewedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnualReportingWindow_date_order" CHECK ("endDate" >= "startDate")
);

CREATE TABLE lecturer_annual."AnnualReportingWindowEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "academicYearId" TEXT NOT NULL REFERENCES public."AcademicYear"("id") ON DELETE RESTRICT,
  "previousStartDate" DATE,
  "previousEndDate" DATE,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "evidenceUrl" TEXT NOT NULL DEFAULT '',
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnualReportingWindowEvent_date_order" CHECK ("endDate" >= "startDate")
);
CREATE INDEX "AnnualReportingWindowEvent_year" ON lecturer_annual."AnnualReportingWindowEvent" ("academicYearId","createdAt");

CREATE TABLE lecturer_annual."AnnualStaffReview" (
  "academicYearId" TEXT NOT NULL REFERENCES public."AcademicYear"("id") ON DELETE RESTRICT,
  "lecturerId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "employmentType" TEXT NOT NULL CHECK ("employmentType" IN ('full_time','part_time','other')),
  "qualification" TEXT NOT NULL CHECK (length(trim("qualification")) > 0),
  "evidenceUrl" TEXT NOT NULL CHECK ("evidenceUrl" ~* '^https?://'),
  "reason" TEXT NOT NULL,
  "reviewedById" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "reviewedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("academicYearId","lecturerId")
);

CREATE TABLE lecturer_annual."AnnualStaffReviewEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "academicYearId" TEXT NOT NULL REFERENCES public."AcademicYear"("id") ON DELETE RESTRICT,
  "lecturerId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "previousEmploymentType" TEXT,
  "previousQualification" TEXT,
  "employmentType" TEXT NOT NULL CHECK ("employmentType" IN ('full_time','part_time','other')),
  "qualification" TEXT NOT NULL,
  "evidenceUrl" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AnnualStaffReviewEvent_year_lecturer" ON lecturer_annual."AnnualStaffReviewEvent" ("academicYearId","lecturerId","createdAt");

-- Validate year attribution in DB as well as API to prevent privileged
-- writers accidentally linking undated or out-of-year portfolio achievements.
CREATE FUNCTION lecturer_annual."validate_evidence_period"()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, lecturer_annual, lecturer_portfolio
AS $annual_check$
DECLARE
  window_start DATE;
  window_end DATE;
  item_start DATE;
  item_end DATE;
BEGIN
  SELECT "startDate","endDate" INTO window_start,window_end
  FROM lecturer_annual."AnnualReportingWindow"
  WHERE "academicYearId"=NEW."academicYearId";

  IF window_start IS NULL THEN
    RAISE EXCEPTION 'Annual reporting window must be configured before linking evidence';
  END IF;

  SELECT "startDate",COALESCE("endDate","startDate") INTO item_start,item_end
  FROM lecturer_portfolio."LecturerPortfolioItem"
  WHERE "id"=NEW."itemId" AND "lecturerId"=NEW."lecturerId";

  IF item_start IS NULL OR item_end IS NULL OR
      item_start > window_end OR item_end < window_start THEN
    RAISE EXCEPTION 'Annual evidence must have a date overlapping the reporting window';
  END IF;
  RETURN NEW;
END; $annual_check$;

CREATE TRIGGER "AnnualEvidenceLink_period_check" BEFORE INSERT OR UPDATE
ON lecturer_annual."AnnualEvidenceLink" FOR EACH ROW
EXECUTE FUNCTION lecturer_annual."validate_evidence_period"();

CREATE TRIGGER "AnnualStaffReviewEvent_immutable" BEFORE UPDATE OR DELETE
ON lecturer_annual."AnnualStaffReviewEvent" FOR EACH ROW
EXECUTE FUNCTION lecturer_annual."reject_append_only_mutation"();
CREATE TRIGGER "AnnualReportingWindowEvent_immutable" BEFORE UPDATE OR DELETE
ON lecturer_annual."AnnualReportingWindowEvent" FOR EACH ROW
EXECUTE FUNCTION lecturer_annual."reject_append_only_mutation"();

DO $annual_privacy$
DECLARE
  t TEXT;
  role_name TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'AnnualReportingWindow','AnnualReportingWindowEvent',
    'AnnualStaffReview','AnnualStaffReviewEvent'
  ] LOOP
    EXECUTE format('ALTER TABLE lecturer_annual.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON TABLE lecturer_annual.%I FROM PUBLIC',t);
    FOR role_name IN SELECT rolname FROM pg_roles
      WHERE rolname=ANY(ARRAY['anon','authenticated','service_role'])
    LOOP
      EXECUTE format('REVOKE ALL ON TABLE lecturer_annual.%I FROM %I',t,role_name);
    END LOOP;
  END LOOP;
END $annual_privacy$;

REVOKE ALL ON FUNCTION lecturer_annual."validate_evidence_period"() FROM PUBLIC;
