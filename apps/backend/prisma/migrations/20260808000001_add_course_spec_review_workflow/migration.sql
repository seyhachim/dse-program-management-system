CREATE TYPE "CourseSpecReviewStatus" AS ENUM ('Draft', 'Submitted', 'UnderReview', 'ChangesRequested', 'Resubmitted', 'Approved');

ALTER TABLE "CourseSpec"
ADD COLUMN "reviewStatus" "CourseSpecReviewStatus" NOT NULL DEFAULT 'Draft',
ADD COLUMN "submissionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "submittedById" TEXT,
ADD COLUMN "submissionNote" TEXT NOT NULL DEFAULT '';

CREATE INDEX "CourseSpec_reviewStatus_idx" ON "CourseSpec"("reviewStatus");
CREATE INDEX "CourseSpec_submittedById_idx" ON "CourseSpec"("submittedById");

ALTER TABLE "CourseSpec"
ADD CONSTRAINT "CourseSpec_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
