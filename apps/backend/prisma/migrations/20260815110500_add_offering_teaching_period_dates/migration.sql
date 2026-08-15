-- Add optional calendar dates for the actual teaching period of a course offering.
-- Existing offerings remain valid with both values NULL; no dates are inferred.
ALTER TABLE "Offering"
  ADD COLUMN "startDate" DATE,
  ADD COLUMN "endDate" DATE;

-- When dates are supplied, they must form a complete ordered range.
ALTER TABLE "Offering"
  ADD CONSTRAINT "Offering_teaching_period_dates_check"
  CHECK (
    ("startDate" IS NULL AND "endDate" IS NULL)
    OR
    ("startDate" IS NOT NULL AND "endDate" IS NOT NULL AND "endDate" >= "startDate")
  );
