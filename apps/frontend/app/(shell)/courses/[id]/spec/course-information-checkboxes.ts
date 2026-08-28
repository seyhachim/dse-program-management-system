const COURSE_TYPE_OPTIONS = [
  "Basic",
  "Core",
  "Elective",
  "Specialization",
  "MoEYS / HEIP",
] as const;

const OPTION_GAP = "\u2003\u2003";

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function courseTypeCheckboxText(courseType: string): string {
  const selected = normalized(courseType);
  return COURSE_TYPE_OPTIONS.map((option) =>
    `${option} ${normalized(option) === selected ? "☑" : "☐"}`,
  ).join(OPTION_GAP);
}

export function courseAvailabilityCheckboxText(semester: string): string {
  const value = semester.trim().toLowerCase();
  const first = value.includes("1") || value.includes("first");
  const second = value.includes("2") || value.includes("second");
  return `1st Semester ${first ? "☑" : "☐"}${OPTION_GAP}2nd Semester ${second ? "☑" : "☐"}`;
}
