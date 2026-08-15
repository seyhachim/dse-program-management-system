-- Section-scoped attendance sessions. One attendance register per offering/date.
CREATE TABLE "AttendanceSession" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "sessionDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceSession_offeringId_fkey"
    FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AttendanceSession_offeringId_sessionDate_key"
  ON "AttendanceSession"("offeringId", "sessionDate");
CREATE INDEX "AttendanceSession_offeringId_sessionDate_idx"
  ON "AttendanceSession"("offeringId", "sessionDate");

-- Attendance is attached to Enrollment, not directly to Student, so a record is
-- always tied to the exact class section in which the student was enrolled.
CREATE TABLE "AttendanceRecord" (
  "sessionId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',

  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("sessionId", "enrollmentId"),
  CONSTRAINT "AttendanceRecord_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceRecord_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceRecord_status_check"
    CHECK ("status" IN ('Present', 'Absent', 'Late', 'Excused'))
);

CREATE INDEX "AttendanceRecord_enrollmentId_idx"
  ON "AttendanceRecord"("enrollmentId");
