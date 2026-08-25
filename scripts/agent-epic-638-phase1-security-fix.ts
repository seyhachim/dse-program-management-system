import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path: string, search: string, replacement: string) {
  const value = readFileSync(path, "utf8");
  const index = value.indexOf(search);
  if (index < 0) throw new Error(`Missing anchor in ${path}`);
  if (value.indexOf(search, index + search.length) >= 0) throw new Error(`Duplicate anchor in ${path}`);
  writeFileSync(path, value.slice(0, index) + replacement + value.slice(index + search.length));
}

replaceOnce(
  "apps/backend/scripts/verify-db-security.ts",
  `  "ProgrammePublicProfile",\n`,
  `  "ProgrammePublicProfile",\n  "AcademicYear",\n  "AcademicCalendar",\n  "AcademicCalendarStudyYear",\n  "AcademicCalendarPeriod",\n  "AcademicCalendarEvent",\n  "AcademicCalendarAuditAction",\n`,
);

appendFileSync(
  "apps/backend/prisma/migrations/20260825162500_academic_calendar_epic_638/migration.sql",
  `\n-- Supabase Data API boundary: backend-owned academic calendar tables are not\n-- directly readable/writable by anon/authenticated/service_role roles. All\n-- access goes through permission-checked PMS APIs.\nALTER TABLE "AcademicYear" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "AcademicCalendar" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "AcademicCalendarStudyYear" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "AcademicCalendarPeriod" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "AcademicCalendarEvent" ENABLE ROW LEVEL SECURITY;\nALTER TABLE "AcademicCalendarAuditAction" ENABLE ROW LEVEL SECURITY;\n\nREVOKE ALL ON TABLE "AcademicYear" FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON TABLE "AcademicCalendar" FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON TABLE "AcademicCalendarStudyYear" FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON TABLE "AcademicCalendarPeriod" FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON TABLE "AcademicCalendarEvent" FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON TABLE "AcademicCalendarAuditAction" FROM PUBLIC, anon, authenticated, service_role;\n\nREVOKE ALL ON FUNCTION guard_academic_calendar_parent_mutation() FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON FUNCTION guard_academic_calendar_child_mutation() FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON FUNCTION guard_academic_calendar_publish_conflict() FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON FUNCTION prevent_academic_calendar_audit_mutation() FROM PUBLIC, anon, authenticated, service_role;\n`,
);

console.log("Epic #638 phase 1 database security patch applied");
