import { REFERENCE_KINDS, type ReferenceKind } from "@dse-pms/shared-types";

export type ReferenceFormItem = {
  id: string;
  kind: ReferenceKind;
  title: string;
  authors: string;
  publisher: string;
  year: string;
  /** Optional edition label, e.g. "2nd Edition" or "Revised Edition". */
  edition?: string;
  isbn: string;
  url: string;
  basedOn: string;
  notes: string;
};

export type ReferencesForm = ReferenceFormItem[];

export const EMPTY_REFERENCES: ReferencesForm = [];

function isReferenceKind(value: unknown): value is ReferenceKind {
  return (
    typeof value === "string" &&
    (REFERENCE_KINDS as readonly string[]).includes(value)
  );
}

/** The oldest allowed publication year when references must be less than ten years old. */
export function minimumReferenceYear(currentYear: number): number {
  return currentYear - 9;
}

/**
 * Validate the publication year independently from the wall clock so boundary
 * behaviour is deterministic in tests. A publication year is required, must be
 * four digits, cannot be in the future, and must be less than ten years old.
 */
export function referenceYearError(
  year: string,
  currentYear = new Date().getFullYear(),
): string | null {
  const trimmed = year.trim();
  const minimumYear = minimumReferenceYear(currentYear);

  if (!/^\d{4}$/.test(trimmed)) {
    return `Publication year must be a 4-digit year between ${minimumYear} and ${currentYear}.`;
  }

  const value = Number(trimmed);
  if (value < minimumYear || value > currentYear) {
    return `Publication year must be between ${minimumYear} and ${currentYear}. References must be less than 10 years old.`;
  }

  return null;
}

/**
 * Safely interpret the one legacy shape we can identify without guessing:
 * `2023 (2nd Edition)`. Ambiguous strings remain untouched for lecturer review.
 * This is a read-time form normalisation only; nothing is persisted until save.
 */
export function parseLegacyReferencePublication(
  year: string,
  edition: string,
): { year: string; edition: string } {
  if (edition.trim()) return { year, edition };

  const match = /^\s*(\d{4})\s*\(([^)]+)\)\s*$/.exec(year);
  if (!match) return { year, edition };

  const parsedYear = match[1];
  const parsedEdition = match[2];
  if (!parsedYear || !parsedEdition) return { year, edition };

  return {
    year: parsedYear,
    edition: parsedEdition.trim(),
  };
}

export function toReferencesForm(raw: unknown): ReferencesForm {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string") return [];

    const rawYear = typeof item.year === "string" ? item.year : "";
    const rawEdition = typeof item.edition === "string" ? item.edition : "";
    const publication = parseLegacyReferencePublication(rawYear, rawEdition);

    return [{
      id: item.id,
      kind: isReferenceKind(item.kind) ? item.kind : "REQUIRED",
      title: typeof item.title === "string" ? item.title : "",
      authors: typeof item.authors === "string" ? item.authors : "",
      publisher: typeof item.publisher === "string" ? item.publisher : "",
      year: publication.year,
      edition: publication.edition,
      isbn: typeof item.isbn === "string" ? item.isbn : "",
      url: typeof item.url === "string" ? item.url : "",
      basedOn: typeof item.basedOn === "string" ? item.basedOn : "",
      notes: typeof item.notes === "string" ? item.notes : "",
    }];
  });
}

export function toReferencesPayload(references: ReferencesForm) {
  return {
    items: references.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title.trim(),
      authors: item.authors.trim(),
      publisher: item.publisher.trim(),
      year: item.year.trim(),
      edition: item.edition?.trim() ?? "",
      isbn: item.isbn.trim(),
      url: item.url.trim(),
      basedOn: item.basedOn.trim(),
      notes: item.notes.trim(),
    })),
  };
}
