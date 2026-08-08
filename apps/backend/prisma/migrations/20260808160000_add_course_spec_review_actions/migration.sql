-- Add immutable Course Specification review actions.
-- This is additive and complements the existing review-status workflow migration.

CREATE TYPE "CourseSpecReviewActionType" AS ENUM ('Submitted', 'Resubmitted', 'ChangesRequested', 'Approved');

CREATE TABLE "CourseSpecReviewAction" (
    "id" TEXT NOT NULL,
    "courseSpecId" TEXT NOT NULL,
    "submissionVersion" INTEGER NOT NULL,
    "action" "CourseSpecReviewActionType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSpecReviewAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseSpecReviewAction_courseSpecId_createdAt_idx"
ON "CourseSpecReviewAction"("courseSpecId", "createdAt");

CREATE INDEX "CourseSpecReviewAction_actorId_idx"
ON "CourseSpecReviewAction"("actorId");

ALTER TABLE "CourseSpecReviewAction"
ADD CONSTRAINT "CourseSpecReviewAction_courseSpecId_fkey"
FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseSpecReviewAction"
ADD CONSTRAINT "CourseSpecReviewAction_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
