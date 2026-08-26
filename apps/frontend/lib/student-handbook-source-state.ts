import type {
  StudentHandbookSourceKind,
  StudentHandbookSourcePreview,
} from "@dse-pms/shared-types";

export type StudentHandbookUnavailableSourceState = {
  title: string;
  message: string;
  explanation: string;
};

const UNAVAILABLE_TITLES: Record<StudentHandbookSourceKind, string> = {
  CURRICULUM_SUMMARY: "Curriculum unavailable",
  PROGRAMME_PROFILE: "Programme profile unavailable",
  PROGRAMME_CONTACT: "Programme contacts unavailable",
};

export function getStudentHandbookUnavailableSourceState(
  preview: StudentHandbookSourcePreview,
): StudentHandbookUnavailableSourceState | null {
  if (!preview.data || typeof preview.data !== "object") return null;

  const data = preview.data as Record<string, unknown>;
  if (data.unavailable !== true) return null;

  return {
    title: UNAVAILABLE_TITLES[preview.kind],
    message:
      typeof data.message === "string" && data.message.trim()
        ? data.message.trim()
        : "This PMS source is not currently available.",
    explanation: "The handbook can only use published PMS data.",
  };
}
