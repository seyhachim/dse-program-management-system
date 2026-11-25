-- Additive only: preserve historical rows and infer legacy classification on read.
CREATE TYPE "CourseSpecSessionType" AS ENUM ('teaching', 'assessment', 'teaching_and_assessment');
ALTER TABLE "CourseSpecWeek" ADD COLUMN "sessionType" "CourseSpecSessionType";
