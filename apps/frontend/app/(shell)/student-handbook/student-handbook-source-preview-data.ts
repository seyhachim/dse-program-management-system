export type StudentHandbookSourceValueKind = "email" | "phone" | "url" | "text" | "other";

const SOURCE_FIELD_LABELS: Record<string, string> = {
  programmeName: "Programme name",
  shortName: "Short name",
  overview: "Overview",
  admissionEmail: "Admission email",
  email: "Email",
  phone: "Phone",
  websiteUrl: "Website",
  facebookUrl: "Facebook",
  campusAddress: "Campus address",
  mapUrl: "Map",
  applicationUrl: "Application",
  totalCourses: "Total courses",
  courseCount: "Courses",
  totalCredits: "Total credits",
  credits: "Credits",
};

export function studentHandbookSourceFieldLabel(key: string): string {
  const known = SOURCE_FIELD_LABELS[key];
  if (known) return known;

  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function isEmptyStudentHandbookSourceValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

export function studentHandbookSourceEntries(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => !isEmptyStudentHandbookSourceValue(entryValue));
}

export function studentHandbookSourceValueKind(key: string, value: unknown): StudentHandbookSourceValueKind {
  if (typeof value !== "string") return "other";
  const normalizedKey = key.toLowerCase();
  const trimmed = value.trim();
  if (!trimmed) return "text";
  if (normalizedKey.includes("email") || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "email";
  if (normalizedKey.includes("phone")) return "phone";
  if (normalizedKey.endsWith("url")) return /^https?:\/\//i.test(trimmed) ? "url" : "text";
  if (/^https?:\/\//i.test(trimmed)) return "url";
  return "text";
}

export function safeStudentHandbookSourceUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
