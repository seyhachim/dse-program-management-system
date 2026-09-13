-- Operational Student status is independent from issuance of the official Student ID.
-- Until an official ID is issued, institutional email remains the required
-- provisional identity. Email is never copied into "studentId".
ALTER TABLE "Student"
  DROP CONSTRAINT IF EXISTS "Student_provisional_identity_check";

ALTER TABLE "Student"
  ADD CONSTRAINT "Student_provisional_identity_check"
  CHECK (
    "studentId" IS NOT NULL
    OR "email" IS NOT NULL
  );

-- Activate only real current provisional students that already have an active
-- cohort membership. This deliberately avoids unrelated/demo records that are
-- not attached to a current cohort.
UPDATE "Student" AS student
SET "status" = 'Active'
WHERE student."status" = 'Pending'
  AND student."studentId" IS NULL
  AND student."email" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "StudentCohortMembership" AS membership
    WHERE membership."studentId" = student."id"
      AND membership."exitedAt" IS NULL
  );
