import { describe, expect, test } from "bun:test";
import { calculateCloEvidence, calculateCourseGrade } from "./assessment-calculation.ts";

const assessments = [
  { id: "attendance", status: "Active", weight: 10, cloCodes: [] },
  { id: "quiz", status: "Active", weight: 20, cloCodes: ["CLO1"] },
  { id: "project", status: "Active", weight: 30, cloCodes: ["CLO1", "CLO2"] },
  { id: "final", status: "Active", weight: 40, cloCodes: ["CLO2"] },
  { id: "practice", status: "Active", weight: null, cloCodes: [] },
];

const results = [
  { assessmentItemId: "attendance", score: 10, maxScore: 10 },
  { assessmentItemId: "quiz", score: 8, maxScore: 10 },
  { assessmentItemId: "project", score: 18, maxScore: 20 },
  { assessmentItemId: "final", score: 30, maxScore: 40 },
  { assessmentItemId: "practice", score: 100, maxScore: 100 },
];

describe("course grade calculation", () => {
  test("uses local course-grade weights including grade-only attendance", () => {
    const grade = calculateCourseGrade(assessments, results);
    expect(grade.complete).toBe(true);
    expect(grade.configuredWeight).toBe(100);
    expect(grade.totalGrade).toBe(83);
    expect(grade.contributions.find((item) => item.assessmentItemId === "attendance")?.weightedContribution).toBe(10);
  });

  test("does not include formative components with no course-grade weight", () => {
    const grade = calculateCourseGrade(assessments, results);
    expect(grade.contributions.some((item) => item.assessmentItemId === "practice")).toBe(false);
  });

  test("does not invent a final grade when required results are incomplete", () => {
    const grade = calculateCourseGrade(assessments, results.filter((item) => item.assessmentItemId !== "final"));
    expect(grade.complete).toBe(false);
    expect(grade.totalGrade).toBeNull();
    expect(grade.completedWeight).toBe(60);
  });

  test("handles zero and maximum scores deterministically", () => {
    const grade = calculateCourseGrade(
      [
        { id: "zero", status: "Active", weight: 50, cloCodes: [] },
        { id: "max", status: "Active", weight: 50, cloCodes: [] },
      ],
      [
        { assessmentItemId: "zero", score: 0, maxScore: 100 },
        { assessmentItemId: "max", score: 100, maxScore: 100 },
      ],
    );
    expect(grade.totalGrade).toBe(50);
  });
});

describe("CLO evidence calculation", () => {
  test("uses only explicitly mapped assessment evidence", () => {
    const clo1 = calculateCloEvidence("CLO1", assessments, results);
    expect(clo1.percentage).toBe(85);
    expect(clo1.evidence.map((item) => item.assessmentItemId)).toEqual(["quiz", "project"]);
  });

  test("grade-only attendance contributes no CLO evidence", () => {
    const clo1 = calculateCloEvidence("CLO1", assessments, results);
    expect(clo1.evidence.some((item) => item.assessmentItemId === "attendance")).toBe(false);
  });

  test("local grade weights do not change CLO aggregation", () => {
    const changedWeights = assessments.map((item) =>
      item.id === "quiz" ? { ...item, weight: 99 } : item,
    );
    expect(calculateCloEvidence("CLO1", changedWeights, results)).toEqual(
      calculateCloEvidence("CLO1", assessments, results),
    );
  });

  test("returns no conclusion when there is no mapped published evidence", () => {
    expect(calculateCloEvidence("CLO9", assessments, results)).toEqual({
      percentage: null,
      evidence: [],
    });
  });
});
