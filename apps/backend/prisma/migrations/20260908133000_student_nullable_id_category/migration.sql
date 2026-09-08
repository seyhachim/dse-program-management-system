-- Support provisional student roster records before official IDs are issued.
DO $$
BEGIN
  CREATE TYPE "StudentCategory" AS ENUM ('Regular', 'Scholarship');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Student" ALTER COLUMN "studentId" DROP NOT NULL;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "category" "StudentCategory" NOT NULL DEFAULT 'Regular';
