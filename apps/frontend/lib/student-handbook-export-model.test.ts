import { describe, expect, test } from "bun:test";
import {
  DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME,
  type StudentHandbookView,
} from "@dse-pms/shared-types";
import { serializeDocumentContent } from "./document-content";
import {
  buildStudentHandbookExportFilename,
  buildStudentHandbookExportModel,
} from "./student-handbook-export-model";

function handbook(status: StudentHandbookView["status"] = "DRAFT"): StudentHandbookView {
  return {
    id: "handbook-1",
    programmeId: "dse",
    title: "Student Handbook",
    version: "2026.1",
    status,
    assignedLecturer: {
      id: "lecturer-1",
      name: "Lecturer One",
      email: "lecturer@example.test",
    },
    submittedAt: null,
    approvedAt: null,
    publishedAt: status === "PUBLISHED" ? "2026-08-23T00:00:00.000Z" : null,
    createdAt: "2026-08-23T00:00:00.000Z",
    updatedAt: "2026-08-23T00:00:00.000Z",
    sections: [
      {
        id: "section-b",
        key: "second",
        title: "Second Section",
        sortOrder: 1,
        isCore: false,
        blocks: [
          {
            id: "rich",
            type: "NARRATIVE",
            sortOrder: 0,
            content: serializeDocumentContent({
              type: "doc",
              version: 1,
              content: [
                {
                  type: "heading",
                  level: 2,
                  align: "center",
                  content: [{ type: "text", text: "Rich heading", marks: { bold: true } }],
                },
                {
                  type: "orderedList",
                  items: [
                    [{ type: "text", text: "First" }],
                    [{ type: "text", text: "Second", marks: { italic: true } }],
                  ],
                },
              ],
            }),
            sourceKind: null,
            label: null,
            sourcePreview: null,
          },
        ],
      },
      {
        id: "section-a",
        key: "first",
        title: "First Section",
        sortOrder: 0,
        isCore: true,
        blocks: [
          {
            id: "source",
            type: "SOURCE_DATA",
            sortOrder: 1,
            content: null,
            sourceKind: "CURRICULUM_SUMMARY",
            label: "Curriculum summary",
            sourcePreview: {
              kind: "CURRICULUM_SUMMARY",
              label: "From Curriculum",
              readOnly: true,
              snapshot: status === "PUBLISHED",
              data: { courses: 48, credits: 143 },
            },
          },
          {
            id: "legacy",
            type: "NARRATIVE",
            sortOrder: 0,
            content: "Legacy paragraph one.\n\nLegacy paragraph two.",
            sourceKind: null,
            label: null,
            sourcePreview: null,
          },
        ],
      },
    ],
  };
}

describe("student handbook export model", () => {
  test("orders sections and blocks while converting legacy and rich narrative", () => {
    const model = buildStudentHandbookExportModel(
      handbook(),
      DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME,
    );

    expect(model.sections.map((section) => section.title)).toEqual([
      "First Section",
      "Second Section",
    ]);
    expect(model.sections[0]?.blocks.map((block) => block.id)).toEqual(["legacy", "source"]);

    const legacy = model.sections[0]?.blocks[0];
    expect(legacy?.type).toBe("NARRATIVE");
    if (legacy?.type === "NARRATIVE") {
      expect(legacy.document.content).toHaveLength(2);
      expect(legacy.document.content[0]?.type).toBe("paragraph");
    }

    const rich = model.sections[1]?.blocks[0];
    expect(rich?.type).toBe("NARRATIVE");
    if (rich?.type === "NARRATIVE") {
      expect(rich.document.content[0]).toMatchObject({
        type: "heading",
        level: 2,
        align: "center",
      });
      expect(rich.document.content[1]?.type).toBe("orderedList");
    }
  });

  test("maps source objects into table rows and preserves theme", () => {
    const theme = {
      ...DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME,
      bodyFontFamily: "Times New Roman" as const,
      bodyFontSizePt: 12,
      defaultAlignment: "left" as const,
    };
    const model = buildStudentHandbookExportModel(handbook(), theme);
    const source = model.sections[0]?.blocks[1];

    expect(model.theme).toEqual(theme);
    expect(source?.type).toBe("SOURCE_DATA");
    if (source?.type === "SOURCE_DATA") {
      expect(source.source.rows).toEqual([
        { key: "courses", value: "48" },
        { key: "credits", value: "143" },
      ]);
      expect(source.source.snapshot).toBe(false);
    }
  });

  test("published export accepts immutable snapshots", () => {
    const model = buildStudentHandbookExportModel(
      handbook("PUBLISHED"),
      DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME,
    );
    const source = model.sections[0]?.blocks[1];

    expect(model.draft).toBe(false);
    expect(source?.type).toBe("SOURCE_DATA");
    if (source?.type === "SOURCE_DATA") {
      expect(source.source.snapshot).toBe(true);
      expect(source.source.unavailable).toBe(false);
      expect(source.source.rows[0]).toEqual({ key: "courses", value: "48" });
    }
  });

  test("published export fails closed instead of substituting live PMS data", () => {
    const input = handbook("PUBLISHED");
    const sourceBlock = input.sections[1]!.blocks[0]!;
    sourceBlock.sourcePreview = {
      kind: "CURRICULUM_SUMMARY",
      label: "From Curriculum",
      readOnly: true,
      snapshot: false,
      data: { courses: 999 },
    };

    const model = buildStudentHandbookExportModel(
      input,
      DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME,
    );
    const source = model.sections[0]?.blocks[1];

    expect(source?.type).toBe("SOURCE_DATA");
    if (source?.type === "SOURCE_DATA") {
      expect(source.source.unavailable).toBe(true);
      expect(source.source.rows).toEqual([]);
      expect(source.source.message).toMatch(/Live PMS data was not substituted/i);
    }
  });

  test("draft export is labeled and filenames include title, version and status", () => {
    const model = buildStudentHandbookExportModel(
      handbook("CHANGES_REQUESTED"),
      DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME,
    );

    expect(model.draft).toBe(true);
    expect(model.generatedLabel).toMatch(/^DRAFT/);
    expect(model.filenameBase).toBe("Student-Handbook-v2026.1-changes_requested");
    expect(buildStudentHandbookExportFilename("Student Handbook", "2026/27", "PUBLISHED")).toBe(
      "Student-Handbook-v2026-27-published",
    );
  });
});
