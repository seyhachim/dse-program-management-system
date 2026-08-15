-- AlterTable
ALTER TABLE "CourseSpec" ADD COLUMN     "specDate" DATE;

-- AlterTable
ALTER TABLE "ProgramLearningOutcome" ADD COLUMN     "cap" TEXT,
ADD COLUMN     "learningDomain" TEXT,
ADD COLUMN     "major" TEXT,
ADD COLUMN     "specificOrGeneric" TEXT;

-- RenameIndex
ALTER INDEX "OfferingAssessmentDeadline_offeringId_courseSpecId_assessmentIt" RENAME TO "OfferingAssessmentDeadline_offeringId_courseSpecId_assessme_key";
