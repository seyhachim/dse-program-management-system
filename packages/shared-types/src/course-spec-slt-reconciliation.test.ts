import { describe, expect, test } from "bun:test";
import { courseSpecHasWeekAssessment, courseSpecInstructionalWeeks, courseSpecSessionType, courseSpecWeeklyPlanWeekAttention, reconcileCourseSpecSlt, type CourseSpecReadinessClo, type CourseSpecReadinessWeek, type CourseSpecReadinessAssessment } from "./course-spec-authoring-readiness.ts";

const teaching = (hours: number): CourseSpecReadinessWeek => ({
  topic: "Synthetic investigation", cloCodes: ["CLO1"], lectureHours: 2,
  selfStudyHours: hours - 2, lloItems: ["Analyse"], activities: ["Practice"],
  teachingMethodIds: ["method"], assessment: "0",
});
const exam = (topic: string, hours: number): CourseSpecReadinessWeek => ({
  topic, cloCodes: ["CLO1"], otherHours: hours, assessment: "Written task",
});
const clo = (sltHours: number | null): CourseSpecReadinessClo => ({
  code: "CLO1", description: "Analyse", status: "active", mappedPlos: ["PLO1"],
  teachingMethodIds: ["method"], sltHours,
});
const assessment = (physical: number | null, independent: number | null): CourseSpecReadinessAssessment => ({
  status: "active", cloCodes: ["CLO1"], physicalSltHours: physical, onlineSltHours: 0, independentSltHours: independent,
});
describe("Phase 3A.1 synthetic course-shaped reconciliation", () => {
  test("TSA301: written examination titles, zero placeholders and missing allocations", () => {
    const weeks = [...Array.from({length: 14}, () => teaching(8)), exam("Midterm written examination", 4), exam("Final written examination", 4)];
    const result = reconcileCourseSpecSlt(weeks, [clo(null)], [assessment(null, null)], { declaredHours: 120 });
    expect(result.instructionalWeeks).toBe(14);
    expect(result.weeklyTotal).toBe(120);
    expect(result.assessmentOnlyTotal).toBe(8);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toContain("missing-clo-allocation");
    expect(result.warnings).toContain("missing-assessment-allocation");
    expect(courseSpecSessionType(weeks[0]!)).toBe("teaching");
    expect(courseSpecHasWeekAssessment(weeks[0]!)).toBe(false);
    expect(courseSpecWeeklyPlanWeekAttention({...weeks[14]!, assessment: "0"})).toContain("Assessment");
    expect(courseSpecSessionType({...weeks[14]!, sessionType: "teaching"})).toBe("teaching");
    expect(courseSpecSessionType({...teaching(8), topic: "Midterm Examination and Reflective Learning", assessment: "Reflective task"})).toBe("teaching_and_assessment");
  });
  test("DSS301: assessment sessions stay in the weekly ledger; policy can require missing allocations", () => {
    const weeks = [...Array.from({length: 14}, () => teaching(8)), exam("Midterm Assessment", 3), exam("Final Assessment", 5)];
    const result = reconcileCourseSpecSlt(weeks, [clo(120)], [assessment(null, null)], { declaredHours: 120, requireAssessmentAllocation: true });
    expect(result.weeklyTotal).toBe(120);
    expect(result.instructionalTotal).toBe(112);
    expect(result.blocking).toContain("missing-assessment-allocation");
    expect(result.blocking).not.toContain("total-mismatch");
  });
  test("WEF201: mixed week and fifteenth instructional row retained; 52 assessment hours not added to 120", () => {
    const weeks = [...Array.from({length: 14}, () => teaching(8)), {...teaching(4), topic: "Midterm Examination and Reflective Learning", sessionType: "teaching_and_assessment" as const, assessment: "Exam"}, exam("Final Assessment", 4)];
    const result = reconcileCourseSpecSlt(weeks, [clo(120)], [assessment(8, 44)], { declaredHours: 120, accountingMode: "inclusive" });
    expect(courseSpecInstructionalWeeks(weeks)).toHaveLength(15);
    expect(result.weeklyTotal).toBe(120);
    expect(result.assessmentTotal).toBe(52);
    expect(result.separateTotal).toBe(168);
    expect(result.inclusiveMatches).toBe(true);
    expect(result.separateMatches).toBe(false);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toContain("verify-assessment-overlap");
    const stricter = reconcileCourseSpecSlt(weeks, [clo(120)], [assessment(8, 44)], { declaredHours: 120, maxInstructionalWeeks: 14 });
    expect(stricter.blocking).toContain("instructional-weeks-above-policy");
    expect(stricter.instructionalWeeks).toBe(15);
  });
  test("separate convention only counts instructional and documented assessment allocations once", () => {
    const result = reconcileCourseSpecSlt([teaching(90), exam("Final Exam", 2)], [clo(120)], [assessment(2, 28)], { declaredHours: 120, accountingMode: "separate" });
    expect(result.separateMatches).toBe(true);
    expect(result.inclusiveMatches).toBe(false);
    expect(result.blocking).toEqual([]);
  });
  test("mismatch, invalid hours, excessive assessment and CLO total rejected; inactive rows ignored", () => {
    const result = reconcileCourseSpecSlt([{...teaching(100), otherHours: -1}], [clo(119), {...clo(100), status: "inactive"}], [assessment(121, 0), {...assessment(900, 900), status: "inactive"}], { declaredHours: 120 });
    expect(result.blocking).toContain("invalid-hours");
    expect(result.blocking).toContain("total-mismatch");
    expect(result.blocking).toContain("clo-total-mismatch");
    expect(result.blocking).toContain("assessment-exceeds-declared");
    expect(result.assessmentTotal).toBe(121);
  });
});
