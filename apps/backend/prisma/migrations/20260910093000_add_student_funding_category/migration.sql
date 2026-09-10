-- FDY 2025 Year-1 attendance rules depend on the student's funding category.
-- Keep this nullable and do not backfill: existing students must remain unknown
-- until an authorized staff member records the source-supported classification.
CREATE TYPE "StudentFundingCategory" AS ENUM ('SCHOLARSHIP', 'FEE_PAYING');

ALTER TABLE "Student"
ADD COLUMN "fundingCategory" "StudentFundingCategory";
