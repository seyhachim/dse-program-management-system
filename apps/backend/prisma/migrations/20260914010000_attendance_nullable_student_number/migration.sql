-- Issue #1098 / #1032: attendance identity is the canonical Student UUID.
-- The official RUPP Student ID is only a historical display snapshot and may
-- legitimately be unavailable for an Active provisional student. Never invent
-- a synthetic student number just to satisfy the attendance tables.
--
-- Existing rows are not rewritten; issued student numbers remain unchanged.
ALTER TABLE "pms_attendance"."AttendanceRecord"
  ALTER COLUMN "studentNumber" DROP NOT NULL;

ALTER TABLE "pms_attendance"."AttendancePermissionPending"
  ALTER COLUMN "studentNumber" DROP NOT NULL;

ALTER TABLE "pms_attendance"."AttendanceCheckpoint"
  ALTER COLUMN "studentNumber" DROP NOT NULL;
