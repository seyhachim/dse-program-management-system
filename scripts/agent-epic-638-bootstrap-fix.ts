import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/agent-epic-638-phase1.ts";
let source = readFileSync(path, "utf8");
const start = source.indexOf("    if (!resolved) throw new AcademicCalendarNotFoundError(");
const end = source.indexOf("    const courses =", start);
if (start < 0 || end < 0) throw new Error("Could not locate staged calendar context error line");
source = source.slice(0, start) +
  `    if (!resolved) throw new AcademicCalendarNotFoundError("No published academic calendar exists for Year " + query.studyYear + ", " + (query.semester === "First" ? "Semester 1" : "Semester 2") + ", " + year.label);\\n` +
  source.slice(end);
writeFileSync(path, source);
console.log("Repaired staged Epic #638 generator quoting");
