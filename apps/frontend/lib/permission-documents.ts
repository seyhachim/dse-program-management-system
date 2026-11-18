import type { PermissionDocumentView } from "./student-portal";

/** Optional evidence must never crash the authoritative attendance register. */
export function safePermissionDocuments(value: unknown): PermissionDocumentView[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PermissionDocumentView =>
    item !== null &&
    typeof item === "object" &&
    typeof item.studentId === "string" &&
    typeof item.id === "string" &&
    typeof item.filename === "string" &&
    typeof item.submittedAt === "string",
  );
}
