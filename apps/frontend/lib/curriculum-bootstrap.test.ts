import { describe, expect, test } from "bun:test";
import { CreateInitialCurriculumSchema } from "@dse-pms/shared-types";
import { INITIAL_DSE_CURRICULUM_INPUT } from "./curriculum-bootstrap";

describe("initial DSE curriculum bootstrap", () => {
  test("creates a valid canonical v1.0 bootstrap payload", () => {
    const parsed = CreateInitialCurriculumSchema.parse(INITIAL_DSE_CURRICULUM_INPUT);

    expect(parsed.code).toBe("DSE");
    expect(parsed.name).toBe(
      "Bachelor of Engineering in Data Science and Engineering (Honors Program)",
    );
    expect(parsed.cohortLabel).toBe("");
    expect(parsed.academicYear).toBe("");
  });
});
