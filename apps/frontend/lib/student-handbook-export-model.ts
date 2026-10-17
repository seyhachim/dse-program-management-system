import type {
  StudentHandbookDocumentTheme,
  StudentHandbookSourcePreview,
  StudentHandbookStatus,
  StudentHandbookView,
} from "@dse-pms/shared-types";
import {
  parseStoredDocumentContent,
  type DseDocumentContent,
} from "./document-content";

export type StudentHandbookExportSourceRow = {
  key: string;
  value: string;
  href?: string;
};

export type StudentHandbookExportSource = {
  label: string;
  snapshot: boolean;
  unavailable: boolean;
  message: string | null;
  rows: StudentHandbookExportSourceRow[];
  text: string | null;
};

export type StudentHandbookExportBlock =
  | {
      id: string;
      type: "NARRATIVE";
      document: DseDocumentContent;
    }
  | {
      id: string;
      type: "SOURCE_DATA";
      source: StudentHandbookExportSource;
    };

export type StudentHandbookExportSection = {
  id: string;
  key: string;
  title: string;
  sortOrder: number;
  blocks: StudentHandbookExportBlock[];
};

export type StudentHandbookExportModel = {
  handbookId: string;
  title: string;
  version: string;
  status: StudentHandbookStatus;
  draft: boolean;
  generatedLabel: string;
  filenameBase: string;
  theme: StudentHandbookDocumentTheme;
  sections: StudentHandbookExportSection[];
};

function safeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sourceHref(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^\/calendar\/[A-Za-z0-9%._~-]+\/[A-Za-z0-9%._~-]+\/year-[1-4]$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function unavailableMessage(preview: StudentHandbookSourcePreview | null): string | null {
  if (!preview?.data || typeof preview.data !== "object" || Array.isArray(preview.data)) return null;
  const record = preview.data as Record<string, unknown>;
  if (record.unavailable !== true) return null;
  return typeof record.message === "string" && record.message.trim()
    ? record.message.trim()
    : "PMS source data is unavailable.";
}

function sourceForExport(
  preview: StudentHandbookSourcePreview | null,
  label: string,
  published: boolean,
): StudentHandbookExportSource {
  if (published && (!preview || preview.snapshot !== true)) {
    return {
      label,
      snapshot: false,
      unavailable: true,
      message: "Published source snapshot is unavailable. Live PMS data was not substituted.",
      rows: [],
      text: null,
    };
  }

  if (!preview) {
    return {
      label,
      snapshot: false,
      unavailable: true,
      message: "PMS source preview is unavailable.",
      rows: [],
      text: null,
    };
  }

  const unavailable = unavailableMessage(preview);
  if (unavailable) {
    return {
      label,
      snapshot: preview.snapshot,
      unavailable: true,
      message: unavailable,
      rows: [],
      text: null,
    };
  }

  if (preview.data && typeof preview.data === "object" && !Array.isArray(preview.data)) {
    return {
      label,
      snapshot: preview.snapshot,
      unavailable: false,
      message: null,
      rows: Object.entries(preview.data as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, value]) => ({ key, value: safeValue(value), href: sourceHref(value) })),
      text: null,
    };
  }

  return {
    label,
    snapshot: preview.snapshot,
    unavailable: false,
    message: null,
    rows: [],
    text: safeValue(preview.data),
  };
}

function slugPart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 80) || "student-handbook";
}

export function buildStudentHandbookExportFilename(
  title: string,
  version: string,
  status: StudentHandbookStatus,
): string {
  return [slugPart(title), `v${slugPart(version)}`, status.toLowerCase()].join("-");
}

export function buildStudentHandbookExportModel(
  handbook: StudentHandbookView,
  theme: StudentHandbookDocumentTheme,
): StudentHandbookExportModel {
  const published = handbook.status === "PUBLISHED";
  const sections = [...handbook.sections]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => ({
      id: section.id,
      key: section.key,
      title: section.title,
      sortOrder: section.sortOrder,
      blocks: [...section.blocks]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map<StudentHandbookExportBlock>((block) =>
          block.type === "NARRATIVE"
            ? {
                id: block.id,
                type: "NARRATIVE",
                document: parseStoredDocumentContent(block.content),
              }
            : {
                id: block.id,
                type: "SOURCE_DATA",
                source: sourceForExport(
                  block.sourcePreview,
                  block.label ?? block.sourcePreview?.label ?? "PMS data",
                  published,
                ),
              },
        ),
    }));

  return {
    handbookId: handbook.id,
    title: handbook.title,
    version: handbook.version,
    status: handbook.status,
    draft: !published,
    generatedLabel: published ? "Published Student Handbook" : "DRAFT — Not an official published handbook",
    filenameBase: buildStudentHandbookExportFilename(handbook.title, handbook.version, handbook.status),
    theme,
    sections,
  };
}
