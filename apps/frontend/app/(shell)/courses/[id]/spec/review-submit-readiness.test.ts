import { describe, expect, test } from "bun:test";
import {
  buildReviewReadinessItems,
  reviewAuthoringItems,
  reviewValidationItems,
} from "./review-submit-readiness";

const completeStatus = {
  courseInfo: "complete",
  assessmentPlan: "complete",
  slt: "complete",
} as const;

describe("Review & Submit readiness", () => {
  test("separates five lecturer authoring areas from Constructive Alignment validation", () => {
    const items = buildReviewReadinessItems({
      status: completeStatus,
      cloReady: true,
      teachingLearningReady: true,
      constructiveAlignmentReady: false,
    });

    expect(reviewAuthoringItems(items).map((item) => item.title)).toEqual([
      "Course Information",
      "Course Learning Outcomes",
      "Teaching & Learning",
      "Assessment",
      "Weekly Plan",
    ]);
    expect(reviewAuthoringItems(items).filter((item) => item.complete)).toHaveLength(5);
    expect(reviewValidationItems(items)).toEqual([
      {
        id: "mapping",
        title: "Constructive Alignment",
        complete: false,
      },
    ]);
    expect(items).toHaveLength(6);
    expect(items.some((item) => item.id === "date")).toBe(false);
  });

  test("keeps Constructive Alignment required for overall readiness", () => {
    const items = buildReviewReadinessItems({
      status: completeStatus,
      cloReady: true,
      teachingLearningReady: true,
      constructiveAlignmentReady: true,
    });

    expect(reviewAuthoringItems(items).filter((item) => item.complete)).toHaveLength(5);
    expect(reviewValidationItems(items).every((item) => item.complete)).toBe(true);
    expect(items.every((item) => item.complete)).toBe(true);
  });

  test("does not let alignment completion hide an existing authoring gap", () => {
    const items = buildReviewReadinessItems({
      status: { ...completeStatus, slt: "draft" },
      cloReady: true,
      teachingLearningReady: true,
      constructiveAlignmentReady: true,
    });

    expect(reviewAuthoringItems(items).filter((item) => item.complete)).toHaveLength(4);
    expect(items.find((item) => item.id === "slt")?.complete).toBe(false);
    expect(reviewValidationItems(items)[0]?.complete).toBe(true);
    expect(items.every((item) => item.complete)).toBe(false);
  });
});
