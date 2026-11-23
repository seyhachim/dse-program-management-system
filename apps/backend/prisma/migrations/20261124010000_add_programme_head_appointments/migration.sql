-- An official Head of Program is an academic appointment, not a separate login.
-- History and actor attribution must survive replacements and revocations.
CREATE TABLE "ProgrammeHeadAppointment" (
    "id" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "lecturerId" TEXT NOT NULL,
    "appointedById" TEXT NOT NULL,
    "endedById" TEXT,
    "appointedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reference" TEXT,
    "coordinatorGranted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProgrammeHeadAppointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProgrammeHeadAppointment_programmeId_appointedAt_idx"
ON "ProgrammeHeadAppointment"("programmeId", "appointedAt" DESC);

CREATE INDEX "ProgrammeHeadAppointment_lecturerId_idx"
ON "ProgrammeHeadAppointment"("lecturerId");

-- One active Head per programme, even when two admins submit concurrently.
CREATE UNIQUE INDEX "ProgrammeHeadAppointment_one_active_per_programme"
ON "ProgrammeHeadAppointment"("programmeId") WHERE "endedAt" IS NULL;

ALTER TABLE "ProgrammeHeadAppointment" ADD CONSTRAINT "ProgrammeHeadAppointment_programmeId_fkey"
FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProgrammeHeadAppointment" ADD CONSTRAINT "ProgrammeHeadAppointment_lecturerId_fkey"
FOREIGN KEY ("lecturerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProgrammeHeadAppointment" ADD CONSTRAINT "ProgrammeHeadAppointment_appointedById_fkey"
FOREIGN KEY ("appointedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProgrammeHeadAppointment" ADD CONSTRAINT "ProgrammeHeadAppointment_endedById_fkey"
FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
