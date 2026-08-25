import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path: string, search: string, replacement: string) {
  const value = readFileSync(path, "utf8");
  const index = value.indexOf(search);
  if (index < 0) throw new Error(`Missing anchor in ${path}`);
  if (value.indexOf(search, index + search.length) >= 0) throw new Error(`Duplicate anchor in ${path}`);
  writeFileSync(path, value.slice(0, index) + replacement + value.slice(index + search.length));
}

replaceOnce(
  "packages/shared-types/src/academic-calendar.ts",
  `export const CreateAcademicCalendarSchema = z.object({ academicYearId: z.string().uuid(), revisionReason: z.string().trim().max(2000).default(""), ...CalendarContentShape._def.schema().shape });`,
  `export const CreateAcademicCalendarSchema = z.object({\n  academicYearId: z.string().uuid(),\n  revisionReason: z.string().trim().max(2000).default(""),\n  studyYears: z.array(AcademicCalendarStudyYearSchema).min(1).max(4),\n  periods: z.array(AcademicCalendarPeriodInputSchema).min(1).max(2),\n  events: z.array(AcademicCalendarEventInputSchema).max(100).default([]),\n  ...SourceFields,\n}).superRefine((value, ctx) => {\n  if (new Set(value.studyYears).size !== value.studyYears.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["studyYears"], message: "Study years must be unique" });\n  if (new Set(value.periods.map((period) => period.semester)).size !== value.periods.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periods"], message: "Each semester may appear once per calendar" });\n});`,
);

replaceOnce(
  "apps/backend/src/plugins/programme/academic-calendar-service.ts",
  `const conflict = await prisma.academicCalendar.findFirst({ where: { id: { not: draft.id }, academicYearId: draft.academicYearId, status: "Published", studyYears: { some: { studyYear: { in: studyYears } } }, periods: { some: { semester: { in: semesters } } } }, select: { id: true } });`,
  `const conflict = await prisma.academicCalendar.findFirst({ where: { id: { notIn: [draft.id, ...(draft.supersedesCalendarId ? [draft.supersedesCalendarId] : [])] }, academicYearId: draft.academicYearId, status: "Published", studyYears: { some: { studyYear: { in: studyYears } } }, periods: { some: { semester: { in: semesters } } } }, select: { id: true } });`,
);

console.log("Epic #638 phase 1 staged-output fixes applied");
