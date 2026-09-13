-- Issue #1092: preserve two immutable roll-call observations while keeping
-- AttendanceRecord / AttendancePermissionPending as the final attendance truth.
-- Existing sessions are intentionally not backfilled; we cannot manufacture
-- historical Check 1 / Check 2 evidence that was never observed.
ALTER TABLE "pms_attendance"."AttendanceSession"
  ADD COLUMN "checkpointTrackingStartedAt" TIMESTAMP(3);

CREATE TABLE "pms_attendance"."AttendanceCheckpoint" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentNumber" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "checkNumber" SMALLINT NOT NULL,
  "status" TEXT,
  "permissionPending" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT NOT NULL DEFAULT '',
  "checkedById" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AttendanceCheckpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceCheckpoint_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "pms_attendance"."AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendanceCheckpoint_checkedById_fkey"
    FOREIGN KEY ("checkedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AttendanceCheckpoint_checkNumber_check"
    CHECK ("checkNumber" IN (1, 2)),
  CONSTRAINT "AttendanceCheckpoint_status_check"
    CHECK ("status" IS NULL OR "status" IN ('Present', 'Absent', 'Late', 'Excused')),
  CONSTRAINT "AttendanceCheckpoint_mark_check"
    CHECK (
      ("status" IS NOT NULL AND "permissionPending" = false)
      OR ("status" IS NULL AND "permissionPending" = true)
    )
);

CREATE UNIQUE INDEX "AttendanceCheckpoint_session_student_check_key"
  ON "pms_attendance"."AttendanceCheckpoint"("sessionId", "studentId", "checkNumber");
CREATE INDEX "AttendanceCheckpoint_sessionId_idx"
  ON "pms_attendance"."AttendanceCheckpoint"("sessionId");
CREATE INDEX "AttendanceCheckpoint_studentId_idx"
  ON "pms_attendance"."AttendanceCheckpoint"("studentId");

-- Match the migration-owned backend-only security posture of pms_attendance.
ALTER TABLE "pms_attendance"."AttendanceCheckpoint" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "pms_attendance"."AttendanceCheckpoint" FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
      'pms_attendance', 'AttendanceCheckpoint', api_role
    );
  END LOOP;
END
$$;
