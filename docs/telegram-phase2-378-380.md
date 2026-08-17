# Telegram Phase 2 — #378, #379, #380

This implementation adds three read-only Telegram Mini App convenience views while preserving PMS ownership of academic data:

- Assessment deadlines come from Student Portal course details and the exact Offering-bound CourseSpec/deadline records.
- Student attendance history reads the existing protected `pms_attendance` sessions/records and returns only the authenticated student's own record after active-student and exact-current-enrollment checks.
- Lecturer workload calls the existing Offerings `workloadForLecturer()` service and `summarizeLecturerWorkload()` calculation.

No new database table, migration, academic calculation source, attendance mutation permission, or Telegram-specific academic persistence is introduced.

## Authorization checks

- deadline dashboard: student role only; Student Portal enrollment scoping remains authoritative.
- attendance history: student role only; active Student + exact current Enrollment + own `studentId` row only.
- workload summary: lecturer role only; workload is computed for the authenticated PMS user id only.
- revoked/unlinked Telegram sessions remain blocked by the existing Mini App session middleware before these routes run.

## Routes

- `GET /api/telegram/mini/assessment-deadlines`
- `GET /api/telegram/mini/student-attendance/:offeringId`
- `GET /api/telegram/mini/lecturer-workload?term=...`

## UI

- `/telegram/deadlines`
- `/telegram/attendance`
- `/telegram/workload`

The role-aware Telegram home links students to deadlines and attendance, and lecturers to workload.
