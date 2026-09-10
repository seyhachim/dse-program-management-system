-- Support provisional student roster records before official IDs are issued.
DO $$
BEGIN
  CREATE TYPE "StudentCategory" AS ENUM ('Regular', 'Scholarship');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Student" ALTER COLUMN "studentId" DROP NOT NULL;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "category" "StudentCategory" NOT NULL DEFAULT 'Regular';

-- A missing official institutional ID is allowed only for an explicitly provisional
-- student that still has a unique institutional email. This prevents null-ID Active
-- academic records and keeps email distinct from the official student number.
ALTER TABLE "Student"
  DROP CONSTRAINT IF EXISTS "Student_provisional_identity_check";
ALTER TABLE "Student"
  ADD CONSTRAINT "Student_provisional_identity_check"
  CHECK (
    "studentId" IS NOT NULL
    OR ("status" = 'Pending' AND "email" IS NOT NULL)
  );
