import { describe, expect, test } from "bun:test";
import { courseReviewStatusLabel } from "./course-review-status";

describe("course review status label", () => {
  test("renders explicit null as No Course Spec", () => {
    expect(courseReviewStatusLabel(null)).toBe("No Course Spec");
  });

  test("keeps a real Draft CourseSpec as Draft", () => {
    expect(courseReviewStatusLabel("Draft")).toBe("Draft");
  });

  test("keeps undefined backward-compatible during API rollout", () => {
    expect(courseReviewStatusLabel(undefined)).toBe("Draft");
  });

  test("preserves existing humanized Changes Requested label", () => {
    expect(courseReviewStatusLabel("ChangesRequested")).toBe(
      "Changes Requested",
    );
  });

  test("preserves other persisted review statuses", () => {
    expect(courseReviewStatusLabel("Approved")).toBe("Approved");
    expect(courseReviewStatusLabel("Submitted")).toBe("Submitted");
  });
});
