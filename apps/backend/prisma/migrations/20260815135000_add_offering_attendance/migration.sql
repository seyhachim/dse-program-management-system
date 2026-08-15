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

-- Keep a small student identity snapshot so historical attendance survives later
-- roster changes. The service only accepts students currently enrolled in the
-- offering at save time; records intentionally do not cascade with Enrollment.
CREATE TABLE "AttendanceRecord" (
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentNumber" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',

  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("sessionId", "studentId"),
  CONSTRAINT "AttendanceRecord_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceRecord_status_check"
    CHECK ("status" IN ('Present', 'Absent', 'Late', 'Excused'))
);

CREATE INDEX "AttendanceRecord_studentId_idx"
  ON "AttendanceRecord"("studentId");
