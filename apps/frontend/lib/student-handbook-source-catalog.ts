import type { StudentHandbookSourceKind } from "@dse-pms/shared-types";

export type StudentHandbookSourceCategory = "Programme" | "Curriculum" | "Academic Calendar";

export type StudentHandbookSourceOption = {
  kind: StudentHandbookSourceKind;
  label: string;
  description: string;
  category: StudentHandbookSourceCategory;
  keywords: string[];
  recommendedSections: string[];
};

export const STUDENT_HANDBOOK_SOURCE_OPTIONS: StudentHandbookSourceOption[] = [
  {
    kind: "CURRICULUM_SUMMARY",
    label: "Curriculum summary",
    description: "Published curriculum totals and study-plan summary.",
    category: "Curriculum",
    keywords: ["curriculum", "study plan", "courses", "credits", "degree"],
    recommendedSections: ["degree", "study-plan"],
  },
  {
    kind: "ACADEMIC_CALENDAR_LINKS",
    label: "Official Academic Calendar",
    description: "Stable public links for the current Academic Year, Years 1–4. Dates stay in the canonical Academic Calendar instead of being copied into the handbook.",
    category: "Academic Calendar",
    keywords: ["academic calendar", "semester", "exam", "break", "dates", "year"],
    recommendedSections: ["study-plan"],
  },
  {
    kind: "PROGRAMME_PROFILE",
    label: "Programme profile",
    description: "Published programme identity and overview information.",
    category: "Programme",
    keywords: ["programme", "program", "overview", "profile", "degree", "welcome"],
    recommendedSections: ["welcome", "degree"],
  },
  {
    kind: "PROGRAMME_CONTACT",
    label: "Programme contacts",
    description: "Published programme contact information.",
    category: "Programme",
    keywords: ["contact", "email", "phone", "support", "programme"],
    recommendedSections: ["student-support", "important-contacts"],
  },
];

export function studentHandbookSourceLabel(kind: StudentHandbookSourceKind): string {
  return STUDENT_HANDBOOK_SOURCE_OPTIONS.find((option) => option.kind === kind)?.label ?? kind;
}

export function recommendedStudentHandbookSources(sectionKey: string): StudentHandbookSourceOption[] {
  return STUDENT_HANDBOOK_SOURCE_OPTIONS.filter((option) =>
    option.recommendedSections.includes(sectionKey),
  );
}

export function filterStudentHandbookSources(query: string): StudentHandbookSourceOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return STUDENT_HANDBOOK_SOURCE_OPTIONS;

  return STUDENT_HANDBOOK_SOURCE_OPTIONS.filter((option) => {
    const haystack = [
      option.label,
      option.description,
      option.category,
      ...option.keywords,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export function availableStudentHandbookSources(
  existingKinds: StudentHandbookSourceKind[],
  query = "",
): StudentHandbookSourceOption[] {
  const existing = new Set(existingKinds);
  return filterStudentHandbookSources(query).filter((option) => !existing.has(option.kind));
}
