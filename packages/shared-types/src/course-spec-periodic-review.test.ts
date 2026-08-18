import { expect, test } from "bun:test";
import {
  CreateCourseSpecPeriodicReviewSchema,
  PeriodicReviewOutcomeSchema,
} from "./course-spec-periodic-review.ts";

test("periodic review supports reaffirm/minor/major outcomes", () => {
  expect(PeriodicReviewOutcomeSchema.options).toEqual([
    "Reaffirmed",
    "MinorRevision",
    "MajorRevision",
  ]);
});

test("periodic review requires evidence, decision reason, and a later next-review date", () => {
  const base = {
    scheduledReviewAt: "2026-08-01T00:00:00.000Z",
    reviewedAt: "2026-08-18T00:00:00.000Z",
    evidenceSummary: "Programme review considered feedback and current course evidence.",
    decisionReason: "The approved specification remains academically appropriate.",
    outcome: "Reaffirmed" as const,
    nextReviewDueAt: "2029-08-18T00:00:00.000Z",
  };
  expect(CreateCourseSpecPeriodicReviewSchema.safeParse(base).success).toBe(true);
  expect(CreateCourseSpecPeriodicReviewSchema.safeParse({
    ...base,
    nextReviewDueAt: "2026-08-18T00:00:00.000Z",
  }).success).toBe(false);
  expect(CreateCourseSpecPeriodicReviewSchema.safeParse({
    ...base,
    evidenceSummary: "short",
  }).success).toBe(false);
});
