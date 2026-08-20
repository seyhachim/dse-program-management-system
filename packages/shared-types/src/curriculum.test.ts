import { describe, expect, test } from "bun:test";
import {
  AddCurriculumCourseSchema,
  CreateCurriculumRevisionSchema,
  CreateInitialCurriculumSchema,
  CurriculumPathwaySchema,
  RemoveCurriculumCourseSchema,
  ReorderCurriculumCoursesSchema,
  UpdateCurriculumCourseSchema,
} from "./curriculum.ts";

describe("curriculum API contracts", () => {
  test("accepts an initial curriculum draft payload", () => {
    const parsed = CreateInitialCurriculumSchema.parse({
      code: "DSE-BENG",
      name: "DSE Bachelor Curriculum",
      cohortLabel: "2026 intake",
      intakeYear: 2026,
      academicYear: "2026-2027",
      effectiveFrom: "2026-09-01",
    });
    expect(parsed.code).toBe("DSE-BENG");
  });

  test("requires reason, summary, and at least one trigger for revisions", () => {
    expect(CreateCurriculumRevisionSchema.safeParse({ revisionType: "Minor", revisionTriggers: [], revisionReason: "", changeSummary: "" }).success).toBe(false);
  });

  test("does not allow Initial as a revision request type", () => {
    expect(CreateCurriculumRevisionSchema.safeParse({ revisionType: "Initial", revisionTriggers: ["ScheduledReview"], revisionReason: "Initial should not be cloned", changeSummary: "Invalid" }).success).toBe(false);
  });

  test("draft placement contracts enforce Year 1-4", () => {
    const base = { courseId: "7df88fc8-f693-461c-a760-69a6acbf50bd", semester: "First", sortOrder: 0 };
    expect(AddCurriculumCourseSchema.safeParse({ ...base, yearLevel: 1 }).success).toBe(true);
    expect(AddCurriculumCourseSchema.safeParse({ ...base, yearLevel: 4 }).success).toBe(true);
    expect(AddCurriculumCourseSchema.safeParse({ ...base, yearLevel: 0 }).success).toBe(false);
    expect(AddCurriculumCourseSchema.safeParse({ ...base, yearLevel: 5 }).success).toBe(false);
  });

  test("placement updates validate semester, credits, and order", () => {
    expect(UpdateCurriculumCourseSchema.safeParse({ yearLevel: 2, semester: "Second", sortOrder: 3, credits: 4, courseType: "Core" }).success).toBe(true);
    expect(UpdateCurriculumCourseSchema.safeParse({ yearLevel: 2, semester: "Third", sortOrder: 3 }).success).toBe(false);
    expect(UpdateCurriculumCourseSchema.safeParse({ yearLevel: 2, semester: "Second", sortOrder: -1 }).success).toBe(false);
  });

  test("removal requires a meaningful reason", () => {
    expect(RemoveCurriculumCourseSchema.safeParse({ reason: "Curriculum committee removed the course" }).success).toBe(true);
    expect(RemoveCurriculumCourseSchema.safeParse({ reason: "   " }).success).toBe(false);
  });

  test("reorder requires a scoped semester and placement ids", () => {
    expect(ReorderCurriculumCoursesSchema.safeParse({ yearLevel: 3, semester: "First", placementIds: ["b9ef991c-3c4d-4e49-b438-95c971f99509"] }).success).toBe(true);
    expect(ReorderCurriculumCoursesSchema.safeParse({ yearLevel: 3, semester: "First", placementIds: [] }).success).toBe(false);
  });

  test("pathway read contract preserves mutually exclusive route metadata", () => {
    const parsed = CurriculumPathwaySchema.parse({
      id: "7df88fc8-f693-461c-a760-69a6acbf50bd",
      code: "RESEARCH",
      name: "Research / Thesis",
      yearLevel: 4,
      semester: "Second",
      isDefault: false,
      creditTarget: 15,
      sortOrder: 1,
      totalCredits: 15,
      courses: [
        {
          placementId: "b9ef991c-3c4d-4e49-b438-95c971f99509",
          courseId: "8df88fc8-f693-461c-a760-69a6acbf50bd",
          code: "THE402",
          title: "Thesis",
          yearLevel: 4,
          semester: "Second",
          credits: 15,
          courseType: "Specialization",
          sortOrder: 0,
          pathwayId: "7df88fc8-f693-461c-a760-69a6acbf50bd",
        },
      ],
    });

    expect(parsed).toMatchObject({
      code: "RESEARCH",
      isDefault: false,
      creditTarget: 15,
      totalCredits: 15,
    });
    expect(parsed.courses[0]?.pathwayId).toBe(parsed.id);
  });
});
