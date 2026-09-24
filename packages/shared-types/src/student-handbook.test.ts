import { describe, expect, test } from "bun:test";
import {
  CreateStudentHandbookSchema,
  SaveStudentHandbookSectionSchema,
  StudentHandbookSourceKindSchema,
  studentHandbookManifest,
} from "./student-handbook.ts";

describe("student handbook contracts", () => {
  test("accepts one lecturer assignment and programme/version identity", () => {
    expect(
      CreateStudentHandbookSchema.parse({
        programmeId: "dse",
        assignedLecturerId: "f8094ae7-9e4c-4406-8a89-8819e5e5b77a",
        version: "2026.1",
      }),
    ).toMatchObject({
      programmeId: "dse",
      version: "2026.1",
      title: "Student Handbook",
    });
  });

  test("keeps narrative and source data as distinct block types", () => {
    const parsed = SaveStudentHandbookSectionSchema.parse({
      blocks: [
        { type: "NARRATIVE", content: "Welcome to the DSE programme." },
        { type: "SOURCE_DATA", sourceKind: "CURRICULUM_SUMMARY" },
        { type: "SOURCE_DATA", sourceKind: "ACADEMIC_CALENDAR_LINKS" },
      ],
    });
    expect(parsed.blocks).toHaveLength(3);
    expect(parsed.blocks[0]?.type).toBe("NARRATIVE");
    expect(parsed.blocks[1]?.type).toBe("SOURCE_DATA");
    expect(parsed.blocks[2]).toMatchObject({
      type: "SOURCE_DATA",
      sourceKind: "ACADEMIC_CALENDAR_LINKS",
    });
  });

  test("supports academic calendar links but rejects unsupported source types", () => {
    expect(StudentHandbookSourceKindSchema.safeParse("ACADEMIC_CALENDAR_LINKS").success).toBe(true);
    expect(StudentHandbookSourceKindSchema.safeParse("EDIT_CURRICULUM").success).toBe(false);
  });

  test("manifest exposes handbook only to governance and lecturers", () => {
    expect(studentHandbookManifest.routes?.[0]).toMatchObject({
      path: "/student-handbook",
      roles: ["admin", "program_coordinator", "lecturer"],
    });
  });
});
