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


describe("marking scheme evidence", () => {
  const hash = "marking-scheme-v1:test";
  const mapping = (criterionId: string, cloCode: string) => ({ criterionId, cloCode, rubricId: "scheme", rubricContentHash: hash });
  const assessment = { id: "midterm", status: "Active", weight: 25, cloCodes: ["CLO1", "CLO2"], criterionCloMappings: [mapping("q1", "CLO1"), mapping("q2", "CLO1"), mapping("q3", "CLO2")] };
  const row = (criterionId: string, cloCode: string, score: number, maxScore: number) => ({ assessmentItemId: "midterm", criterionId, criterionName: criterionId, rubricId: "scheme", rubricContentHash: hash, score, maxScore, cloCodes: [cloCode] });
  const evidence = [row("q1", "CLO1", 2, 2), row("q2", "CLO1", 4, 8), row("q3", "CLO2", 7, 8)];
  const results = [{ assessmentItemId: "midterm", score: 13, maxScore: 18 }];
  test("aggregates earned/max marks, not a mean of unequal question percentages", () => {
    const outcome = calculateCloEvidence("CLO1", [assessment], results, evidence);
    expect(outcome.percentage).toBe(60);
    expect(outcome.evidence).toHaveLength(2);
  });
  test("missing mapped question does not fall back to overall exam result", () => {
    expect(calculateCloEvidence("CLO1", [assessment], results, [evidence[0]!]).percentage).toBeNull();
    expect(calculateCloEvidence("CLO1", [assessment], results, []).evidence).toEqual([]);
  });
  test("rejects mismatched historical instrument hash", () => {
    expect(calculateCloEvidence("CLO1", [assessment], results, [{ ...evidence[0]!, rubricContentHash: "different" }, evidence[1]!]).percentage).toBeNull();
  });
  test("each scheme contributes one points-based aggregate alongside other evidence", () => {
    const other = { id: "lab", status: "Active", weight: 75, cloCodes: ["CLO1"] };
    const outcome = calculateCloEvidence("CLO1", [assessment, other], [...results, { assessmentItemId: "lab", score: 8, maxScore: 10 }], evidence);
    expect(outcome.percentage).toBe(70);
  });
});

 test("linked marking scheme without mappings never falls back to the exam total", () => {
  expect(calculateCloEvidence("CLO1", [{ id: "exam", status: "Active", weight: 25, cloCodes: ["CLO1"], rubric: { instrumentKind: "marking_scheme" } }], [{ assessmentItemId: "exam", score: 18, maxScore: 25 }]).percentage).toBeNull();
});
