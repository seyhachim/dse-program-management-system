-- Academic course-specification versioning.
-- submissionVersion intentionally remains the submission-attempt counter.

CREATE TYPE "CourseSpecRevisionType" AS ENUM ('Initial', 'Minor', 'Major');
CREATE TYPE "CourseSpecRevisionTrigger" AS ENUM (
  'ScheduledReview',
  'StudentFeedback',
  'AlumniFeedback',
  'EmployerFeedback',
  'LecturerReflection',
  'ProgrammeCoordinator',
  'ExternalExaminer',
  'QaFinding',
  'RegulatoryChange',
  'Other'
);

ALTER TABLE "CourseSpec"
  ADD COLUMN "versionMajor" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "versionMinor" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "revisionType" "CourseSpecRevisionType" NOT NULL DEFAULT 'Initial',
  ADD COLUMN "revisionTriggers" "CourseSpecRevisionTrigger"[] NOT NULL DEFAULT ARRAY[]::"CourseSpecRevisionTrigger"[],
  ADD COLUMN "revisionReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "changeSummary" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "basedOnVersionId" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "nextReviewDueAt" TIMESTAMP(3),
  ADD COLUMN "contentHash" TEXT;

-- Existing rows are academic version 1.0 regardless of submissionVersion.
UPDATE "CourseSpec"
SET "versionMajor" = 1,
    "versionMinor" = 0,
    "revisionType" = 'Initial';

-- Recover approval time from the immutable review history where possible.
WITH latest_approval AS (
  SELECT DISTINCT ON ("courseSpecId")
    "courseSpecId",
    "createdAt"
  FROM "CourseSpecReviewAction"
  WHERE "action" = 'Approved'
  ORDER BY "courseSpecId", "createdAt" DESC
)
UPDATE "CourseSpec" AS cs
SET "approvedAt" = latest_approval."createdAt",
    "nextReviewDueAt" = latest_approval."createdAt" + INTERVAL '3 years'
FROM latest_approval
WHERE latest_approval."courseSpecId" = cs."id"
  AND cs."reviewStatus" = 'Approved';

DROP INDEX IF EXISTS "CourseSpec_courseId_key";

CREATE UNIQUE INDEX "CourseSpec_courseId_versionMajor_versionMinor_key"
ON "CourseSpec" ("courseId", "versionMajor", "versionMinor");

CREATE INDEX "CourseSpec_courseId_reviewStatus_idx"
ON "CourseSpec" ("courseId", "reviewStatus");

CREATE INDEX "CourseSpec_nextReviewDueAt_idx"
ON "CourseSpec" ("nextReviewDueAt");

CREATE INDEX "CourseSpec_basedOnVersionId_idx"
ON "CourseSpec" ("basedOnVersionId");

CREATE UNIQUE INDEX "CourseSpec_one_open_revision_per_course"
ON "CourseSpec" ("courseId")
WHERE "reviewStatus" IN (
  'Draft',
  'Submitted',
  'UnderReview',
  'ChangesRequested',
  'Resubmitted'
);

ALTER TABLE "CourseSpec"
ADD CONSTRAINT "CourseSpec_basedOnVersionId_fkey"
FOREIGN KEY ("basedOnVersionId") REFERENCES "CourseSpec"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
