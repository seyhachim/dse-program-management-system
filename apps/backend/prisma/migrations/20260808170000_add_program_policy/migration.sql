-- CreateTable
CREATE TABLE "ProgramPolicy" (
    "id" TEXT NOT NULL DEFAULT 'dse',
    "attendancePreparation" TEXT NOT NULL DEFAULT '',
    "academicIntegrity" TEXT NOT NULL DEFAULT '',
    "assignmentsLateSubmission" TEXT NOT NULL DEFAULT '',
    "examinationRules" TEXT NOT NULL DEFAULT '',
    "penaltiesConsequences" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramPolicy_pkey" PRIMARY KEY ("id")
);

-- Keep the programme configuration table protected from direct public access.
ALTER TABLE "ProgramPolicy" ENABLE ROW LEVEL SECURITY;
