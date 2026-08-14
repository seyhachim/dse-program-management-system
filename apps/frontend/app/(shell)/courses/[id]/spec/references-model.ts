import { REFERENCE_KINDS, type ReferenceKind } from "@dse-pms/shared-types";

export type ReferenceFormItem = {
  id: string;
  kind: ReferenceKind;
  title: string;
  authors: string;
  publisher: string;
  year: string;
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

export function toReferencesForm(raw: unknown): ReferencesForm {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];

  return items.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    if (typeof item.id !== "string") return [];

    return [{
      id: item.id,
      kind: isReferenceKind(item.kind) ? item.kind : "REQUIRED",
      title: typeof item.title === "string" ? item.title : "",
      authors: typeof item.authors === "string" ? item.authors : "",
      publisher: typeof item.publisher === "string" ? item.publisher : "",
      year: typeof item.year === "string" ? item.year : "",
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
      isbn: item.isbn.trim(),
      url: item.url.trim(),
      basedOn: item.basedOn.trim(),
      notes: item.notes.trim(),
    })),
  };
}
