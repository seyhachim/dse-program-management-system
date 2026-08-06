-- AlterTable
ALTER TABLE "CourseSpecWeek" ADD COLUMN     "assessmentMethodIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
