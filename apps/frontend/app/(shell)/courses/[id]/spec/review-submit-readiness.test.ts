import { describe, expect, test } from "bun:test";
import { buildReviewReadinessItems } from "./review-submit-readiness";

const completeStatus = {
  courseInfo: "complete",
  assessmentPlan: "complete",
  slt: "complete",
} as const;

describe("Review & Submit readiness", () => {
  test("preserves the existing six checks and appends Constructive Alignment as seventh", () => {
    const items = buildReviewReadinessItems({
      status: completeStatus,
      cloReady: true,
      teachingLearningReady: true,
      specificationDateReady: true,
      constructiveAlignmentReady: false,
    });

    expect(items.map((item) => item.title)).toEqual([
      "Course Information",
      "Course Learning Outcomes",
      "Teaching & Learning",
      "Assessment",
      "Weekly Plan",
      "Specification Date",
      "Constructive Alignment",
    ]);
    expect(items.filter((item) => item.complete)).toHaveLength(6);
    expect(items).toHaveLength(7);
  });

  test("reports seven of seven when alignment is complete", () => {
    const items = buildReviewReadinessItems({
      status: completeStatus,
      cloReady: true,
      teachingLearningReady: true,
      specificationDateReady: true,
      constructiveAlignmentReady: true,
    });

    expect(items.filter((item) => item.complete)).toHaveLength(7);
  });

  test("does not let alignment completion hide an existing readiness gap", () => {
    const items = buildReviewReadinessItems({
      status: { ...completeStatus, slt: "draft" },
      cloReady: true,
      teachingLearningReady: true,
      specificationDateReady: true,
      constructiveAlignmentReady: true,
    });

    expect(items.filter((item) => item.complete)).toHaveLength(6);
    expect(items.find((item) => item.id === "slt")?.complete).toBe(false);
    expect(items.find((item) => item.id === "mapping")?.complete).toBe(true);
  });
});
