import { readFileSync, writeFileSync } from "node:fs";

function fix(path: string, before: string, after: string): void {
  const source = readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Expected staged output not found in ${path}: ${before}`);
  writeFileSync(path, source.replace(before, after));
}

fix(
  "apps/backend/src/plugins/student-portal/service.ts",
  "  type AcademicYearView,\n  type PublishedAcademicCalendarProjection,\n  type StudentAcademicCalendarView,\n",
  "  AcademicYearView,\n  PublishedAcademicCalendarProjection,\n  StudentAcademicCalendarView,\n",
);

fix(
  "apps/backend/src/plugins/offerings/service.ts",
  '      semester: OfferingView["semester"] extends infer _T ? "First" | "Second" : never;\n',
  '      semester: "First" | "Second";\n',
);

console.log("Epic #638 staged consumer fixes applied");
