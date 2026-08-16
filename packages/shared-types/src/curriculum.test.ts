import { describe, expect, test } from "bun:test";
import {
  CreateCurriculumRevisionSchema,
  CreateInitialCurriculumSchema,
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
    expect(
      CreateCurriculumRevisionSchema.safeParse({
        revisionType: "Minor",
        revisionTriggers: [],
        revisionReason: "",
        changeSummary: "",
      }).success,
    ).toBe(false);
  });

  test("does not allow Initial as a revision request type", () => {
    expect(
      CreateCurriculumRevisionSchema.safeParse({
        revisionType: "Initial",
        revisionTriggers: ["ScheduledReview"],
        revisionReason: "Initial should not be cloned",
        changeSummary: "Invalid",
      }).success,
    ).toBe(false);
  });
});
