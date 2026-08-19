import { describe, expect, test } from "bun:test";
import { calculateDerivedGroupResult, groupAssessmentReadiness } from "./group-assessment-results.ts";

describe("group assessment result calculation", () => {
  test("Group mode copies the shared score without changing its scale", () => {
    expect(calculateDerivedGroupResult({ mode: "Group", groupScore: 16, groupMaxScore: 20, groupFeedback: "Good work" })).toEqual({ score: 16, maxScore: 20, feedback: "Good work" });
  });

  test("Group + Individual combines normalized weighted components and an explicit adjustment", () => {
    const result = calculateDerivedGroupResult({ mode: "GroupIndividual", groupScore: 16, groupMaxScore: 20, groupWeight: 70, individualScore: 7, individualMaxScore: 10, individualWeight: 30, adjustmentPoints: 1, adjustmentReason: "Oral defense evidence" });
    expect(result.score).toBe(80);
    expect(result.maxScore).toBe(100);
    expect(result.feedback).toContain("Adjustment +1");
  });
});

describe("group assessment publication readiness", () => {
  test("requires complete membership, source scores, individual components, and scoped rubric evidence", () => {
    const ready = groupAssessmentReadiness({
      mode: "GroupIndividual",
      enrollmentIds: ["e1", "e2"],
      groupWeight: 70,
      individualWeight: 30,
      rubricCriterionIds: [{ id: "team", scope: "group" }, { id: "oral", scope: "individual" }],
      groups: [{ id: "g1", memberEnrollmentIds: ["e1", "e2"], hasScore: true, groupCriterionIds: ["team"], individualComponents: [{ enrollmentId: "e1", criterionIds: ["oral"] }, { enrollmentId: "e2", criterionIds: ["oral"] }] }],
    });
    expect(ready.readyToPublish).toBe(true);

    const missing = groupAssessmentReadiness({
      mode: "GroupIndividual",
      enrollmentIds: ["e1", "e2"],
      groupWeight: 70,
      individualWeight: 30,
      rubricCriterionIds: [{ id: "team", scope: "group" }, { id: "oral", scope: "individual" }],
      groups: [{ id: "g1", memberEnrollmentIds: ["e1"], hasScore: true, groupCriterionIds: [], individualComponents: [] }],
    });
    expect(missing.readyToPublish).toBe(false);
    expect(missing.unassignedEnrollmentIds).toEqual(["e2"]);
    expect(missing.missingGroupCriterionGroupIds).toEqual(["g1"]);
  });
});
