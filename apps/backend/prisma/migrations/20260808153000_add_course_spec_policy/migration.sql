-- CreateTable
CREATE TABLE "CourseSpecPolicy" (
    "courseSpecId" TEXT NOT NULL,
    "attendancePreparation" TEXT NOT NULL DEFAULT '',
    "academicIntegrity" TEXT NOT NULL DEFAULT '',
    "assignmentsLateSubmission" TEXT NOT NULL DEFAULT '',
    "examinationRules" TEXT NOT NULL DEFAULT '',
    "penaltiesConsequences" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseSpecPolicy_pkey" PRIMARY KEY ("courseSpecId")
);

-- AddForeignKey
ALTER TABLE "CourseSpecPolicy" ADD CONSTRAINT "CourseSpecPolicy_courseSpecId_fkey"
  FOREIGN KEY ("courseSpecId") REFERENCES "CourseSpec"("id") ON DELETE CASCADE ON UPDATE CASCADE;
