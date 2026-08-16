import { describe, expect, test } from "bun:test";
import {
  ReferenceError,
  validateAssessmentCloEvidence,
  validateCriterionCloMappings,
  validateCourseSpecMappingEvidence,
} from "./service.ts";

describe("assessment CLO evidence validation", () => {
  const clos = new Set(["CLO1", "CLO2"]);

  test("accepts grade-only assessments without CLO evidence", () => {
    expect(() =>
      validateAssessmentCloEvidence(
        [{ name: "Attendance & Participation", cloCodes: [] }],
        clos,
      ),
    ).not.toThrow();
  });

  test("accepts explicit mappings to CLOs in the same course specification", () => {
    expect(() =>
      validateAssessmentCloEvidence(
        [{ name: "Project", cloCodes: ["CLO1", "CLO2"] }],
        clos,
      ),
    ).not.toThrow();
  });

  test("rejects a CLO code that does not exist in the course specification", () => {
    expect(() =>
      validateAssessmentCloEvidence(
        [{ name: "Project", cloCodes: ["CLO3"] }],
        clos,
      ),
    ).toThrow(ReferenceError);
  });

  test("rejects duplicate CLO evidence mappings on one assessment", () => {
    expect(() =>
      validateAssessmentCloEvidence(
        [{ name: "Project", cloCodes: ["CLO1", "CLO1"] }],
        clos,
      ),
    ).toThrow("duplicate CLO mapping");
  });
});

describe("course-spec alignment mapping validation", () => {
  const clos = new Set(["CLO1", "CLO2"]);
  const weekIds = new Set(["week-1"]);
  const assessmentIds = new Set(["assessment-1"]);

  test("accepts valid week and assessment evidence refs", () => {
    expect(() =>
      validateCourseSpecMappingEvidence(
        [
          { cloCode: "CLO1", kind: "week", ref: "week-1" },
          { cloCode: "CLO2", kind: "assessment", ref: "assessment-1" },
        ],
        clos,
        weekIds,
        assessmentIds,
      ),
    ).not.toThrow();
  });

  test("rejects an unknown CLO", () => {
    expect(() =>
      validateCourseSpecMappingEvidence(
        [{ cloCode: "CLO3", kind: "assessment", ref: "assessment-1" }],
        clos,
        weekIds,
        assessmentIds,
      ),
    ).toThrow(ReferenceError);
  });

  test("rejects an assessment ref outside the current course specification", () => {
    expect(() =>
      validateCourseSpecMappingEvidence(
        [{ cloCode: "CLO1", kind: "assessment", ref: "other-assessment" }],
        clos,
        weekIds,
        assessmentIds,
      ),
    ).toThrow("does not belong to this course specification");
  });

  test("rejects duplicate mapping triples instead of silently deduplicating", () => {
    expect(() =>
      validateCourseSpecMappingEvidence(
        [
          { cloCode: "CLO1", kind: "assessment", ref: "assessment-1" },
          { cloCode: "CLO1", kind: "assessment", ref: "assessment-1" },
        ],
        clos,
        weekIds,
        assessmentIds,
      ),
    ).toThrow("Duplicate CLO alignment mapping");
  });
});


describe("criterion CLO evidence ownership", () => {
  const validClos = new Set(["CLO1", "CLO2"]);
  test("accepts explicit mappings for criteria in the linked rubric", () => {
    expect(() => validateCriterionCloMappings(
      { name: "Project", rubricId: "r1", cloCodes: ["CLO1"], criterionCloMappings: [{ criterionId: "c1", cloCodes: ["CLO1"] }] },
      validClos,
      new Set(["c1", "c2"]),
    )).not.toThrow();
  });
  test("rejects a foreign rubric criterion", () => {
    expect(() => validateCriterionCloMappings(
      { name: "Project", rubricId: "r1", cloCodes: ["CLO1"], criterionCloMappings: [{ criterionId: "foreign", cloCodes: ["CLO1"] }] },
      validClos,
      new Set(["c1"]),
    )).toThrow("does not belong to its linked rubric");
  });
  test("rejects criterion CLO evidence outside the assessment-level CLO set", () => {
    expect(() => validateCriterionCloMappings(
      { name: "Project", rubricId: "r1", cloCodes: ["CLO1"], criterionCloMappings: [{ criterionId: "c1", cloCodes: ["CLO2"] }] },
      validClos,
      new Set(["c1"]),
    )).toThrow("not mapped at assessment level");
  });
});
