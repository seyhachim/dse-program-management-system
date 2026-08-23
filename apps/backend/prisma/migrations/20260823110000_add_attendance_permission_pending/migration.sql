-- Issue #566: keep unresolved permission claims separate from finalized attendance truth.
-- Students provide the paper permission letter physically; only authorized staff
-- can later resolve the workflow to a finalized attendance mark.
CREATE TABLE "pms_attendance"."AttendancePermissionPending" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "studentNumber" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolution" TEXT,

  CONSTRAINT "AttendancePermissionPending_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendancePermissionPending_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "pms_attendance"."AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AttendancePermissionPending_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AttendancePermissionPending_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AttendancePermissionPending_resolution_check"
    CHECK ("resolution" IS NULL OR "resolution" IN ('Present', 'Absent', 'Late', 'Excused', 'Cleared')),
  CONSTRAINT "AttendancePermissionPending_resolution_state_check"
    CHECK (("resolvedAt" IS NULL AND "resolution" IS NULL) OR ("resolvedAt" IS NOT NULL AND "resolution" IS NOT NULL))
);

CREATE UNIQUE INDEX "AttendancePermissionPending_active_session_student_key"
  ON "pms_attendance"."AttendancePermissionPending"("sessionId", "studentId")
  WHERE "resolvedAt" IS NULL;
CREATE INDEX "AttendancePermissionPending_sessionId_idx"
  ON "pms_attendance"."AttendancePermissionPending"("sessionId");
CREATE INDEX "AttendancePermissionPending_studentId_idx"
  ON "pms_attendance"."AttendancePermissionPending"("studentId");

-- Match the migration-owned backend-only security posture of pms_attendance.
ALTER TABLE "pms_attendance"."AttendancePermissionPending" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "pms_attendance"."AttendancePermissionPending" FROM PUBLIC;

DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles
    WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
      'pms_attendance', 'AttendancePermissionPending', api_role
    );
  END LOOP;
END
$$;
