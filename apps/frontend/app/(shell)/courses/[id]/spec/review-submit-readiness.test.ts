import { describe, expect, test } from "bun:test";
import { buildReviewReadinessItems } from "./review-submit-readiness";

const completeStatus = {
  courseInfo: "complete",
  assessmentPlan: "complete",
  slt: "complete",
} as const;

describe("Review & Submit readiness", () => {
  test("counts lecturer-completable checks plus Constructive Alignment", () => {
    const items = buildReviewReadinessItems({
      status: completeStatus,
      cloReady: true,
      teachingLearningReady: true,
      constructiveAlignmentReady: false,
    });

    expect(items.map((item) => item.title)).toEqual([
      "Course Information",
      "Course Learning Outcomes",
      "Teaching & Learning",
      "Assessment",
      "Weekly Plan",
      "Constructive Alignment",
    ]);
    expect(items.filter((item) => item.complete)).toHaveLength(5);
    expect(items).toHaveLength(6);
    expect(items.some((item) => item.id === "date")).toBe(false);
  });

  test("reports six of six when all lecturer-completable checks are ready", () => {
    const items = buildReviewReadinessItems({
      status: completeStatus,
      cloReady: true,
      teachingLearningReady: true,
      constructiveAlignmentReady: true,
    });

    expect(items.filter((item) => item.complete)).toHaveLength(6);
  });

  test("does not let alignment completion hide an existing readiness gap", () => {
    const items = buildReviewReadinessItems({
      status: { ...completeStatus, slt: "draft" },
      cloReady: true,
      teachingLearningReady: true,
      constructiveAlignmentReady: true,
    });

    expect(items.filter((item) => item.complete)).toHaveLength(5);
    expect(items.find((item) => item.id === "slt")?.complete).toBe(false);
    expect(items.find((item) => item.id === "mapping")?.complete).toBe(true);
  });
});
