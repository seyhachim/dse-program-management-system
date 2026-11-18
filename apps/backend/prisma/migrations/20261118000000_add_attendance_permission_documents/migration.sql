-- #1311: private evidence for an existing canonical Permission Pending attendance row.
-- The student upload never changes the lecturer-owned final attendance state.
CREATE TABLE "pms_attendance"."AttendancePermissionDocument" (
  "id" TEXT NOT NULL,
  "permissionPendingId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendancePermissionDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendancePermissionDocument_pending_fkey"
    FOREIGN KEY ("permissionPendingId") REFERENCES "pms_attendance"."AttendancePermissionPending"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AttendancePermissionDocument_student_fkey"
    FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AttendancePermissionDocument_submitter_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "public"."User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AttendancePermissionDocument_size_check"
    CHECK ("sizeBytes" BETWEEN 1 AND 5242880),
  CONSTRAINT "AttendancePermissionDocument_mime_check"
    CHECK ("mimeType" IN ('application/pdf', 'image/jpeg', 'image/png'))
);
CREATE UNIQUE INDEX "AttendancePermissionDocument_pending_key"
  ON "pms_attendance"."AttendancePermissionDocument"("permissionPendingId");
CREATE UNIQUE INDEX "AttendancePermissionDocument_path_key"
  ON "pms_attendance"."AttendancePermissionDocument"("storagePath");
CREATE INDEX "AttendancePermissionDocument_student_idx"
  ON "pms_attendance"."AttendancePermissionDocument"("studentId", "submittedAt");

-- Backend-only, like the other pms_attendance tables. No Data API access.
ALTER TABLE "pms_attendance"."AttendancePermissionDocument" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE "pms_attendance"."AttendancePermissionDocument" FROM PUBLIC;
DO $$
DECLARE api_role text;
BEGIN
  FOR api_role IN
    SELECT rolname FROM pg_roles WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role'])
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %I',
      'pms_attendance', 'AttendancePermissionDocument', api_role);
  END LOOP;
END
$$;
