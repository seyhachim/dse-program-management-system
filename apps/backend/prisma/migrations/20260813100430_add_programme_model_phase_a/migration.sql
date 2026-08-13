-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "programmeId" TEXT;

-- AlterTable
ALTER TABLE "UserRoleAssignment" ADD COLUMN     "programmeId" TEXT;

-- CreateTable
CREATE TABLE "Programme" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Programme_code_key" ON "Programme"("code");

-- CreateIndex
CREATE INDEX "Course_programmeId_idx" ON "Course"("programmeId");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_programmeId_idx" ON "UserRoleAssignment"("programmeId");

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Programme" ENABLE ROW LEVEL SECURITY;

-- Issue #143 phase A: seed the single existing programme (id matches the
-- "dse" singleton convention ProgrammeProfile/ProgramPolicy already use),
-- then backfill every existing UserRoleAssignment/Course row onto it.
-- Nothing enforces this scope yet — phase B. ON CONFLICT guards against a
-- re-run against a database that already has the row.
INSERT INTO "Programme" ("id", "code", "name", "status", "updatedAt")
VALUES ('dse', 'DSE', 'Data Science and Engineering', 'active', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "UserRoleAssignment" SET "programmeId" = 'dse' WHERE "programmeId" IS NULL;

UPDATE "Course" SET "programmeId" = 'dse' WHERE "programmeId" IS NULL;
