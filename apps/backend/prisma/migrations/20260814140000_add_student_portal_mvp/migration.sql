-- Student login linkage is additive so existing roster-only students remain valid.
ALTER TABLE "Student" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "Student_userId_key" ON "Student"("userId");
ALTER TABLE "Student"
  ADD CONSTRAINT "Student_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OfferingAssessmentDeadline" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfferingAssessmentDeadline_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfferingAssessmentDeadline_offeringId_courseSpecId_assessmentItemId_key"
  ON "OfferingAssessmentDeadline"("offeringId", "courseSpecId", "assessmentItemId");
CREATE INDEX "OfferingAssessmentDeadline_offeringId_dueAt_idx"
  ON "OfferingAssessmentDeadline"("offeringId", "dueAt");
ALTER TABLE "OfferingAssessmentDeadline"
  ADD CONSTRAINT "OfferingAssessmentDeadline_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "Offering"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AssessmentResult" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "courseSpecId" TEXT NOT NULL,
  "assessmentItemId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "maxScore" DOUBLE PRECISION NOT NULL,
  "feedback" TEXT NOT NULL DEFAULT '',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentResult_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AssessmentResult_enrollmentId_courseSpecId_assessmentItemId_key"
  ON "AssessmentResult"("enrollmentId", "courseSpecId", "assessmentItemId");
CREATE INDEX "AssessmentResult_enrollmentId_publishedAt_idx"
  ON "AssessmentResult"("enrollmentId", "publishedAt");
ALTER TABLE "AssessmentResult"
  ADD CONSTRAINT "AssessmentResult_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CourseAnnouncement" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseAnnouncement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CourseAnnouncement_offeringId_publishedAt_idx"
  ON "CourseAnnouncement"("offeringId", "publishedAt");
ALTER TABLE "CourseAnnouncement"
  ADD CONSTRAINT "CourseAnnouncement_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "Offering"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseAnnouncement"
  ADD CONSTRAINT "CourseAnnouncement_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CourseFeedback" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "responseKeyHash" TEXT NOT NULL,
  "overallRating" INTEGER NOT NULL,
  "teachingClarityRating" INTEGER NOT NULL,
  "assessmentClarityRating" INTEGER NOT NULL,
  "workload" TEXT NOT NULL,
  "positiveComment" TEXT NOT NULL DEFAULT '',
  "improvementComment" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseFeedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CourseFeedback_offeringId_responseKeyHash_key"
  ON "CourseFeedback"("offeringId", "responseKeyHash");
CREATE INDEX "CourseFeedback_offeringId_createdAt_idx"
  ON "CourseFeedback"("offeringId", "createdAt");
ALTER TABLE "CourseFeedback"
  ADD CONSTRAINT "CourseFeedback_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "Offering"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Link any existing student User rows by exact email when the relationship is unambiguous.
UPDATE "Student" AS s
SET "userId" = u."id"
FROM "User" AS u
JOIN "UserRoleAssignment" AS ura ON ura."userId" = u."id"
JOIN "Role" AS r ON r."id" = ura."roleId" AND r."slug" = 'student'
WHERE s."email" = u."email" AND s."userId" IS NULL;
