-- AlterTable
ALTER TABLE "CourseSpecWeek" ADD COLUMN     "teachingResourceTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];
