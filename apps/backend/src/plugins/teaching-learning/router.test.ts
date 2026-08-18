import { expect, test } from "bun:test";
import {
  TeachingLearningInput,
  hasProgrammeWideRole,
  isEditableReviewStatus,
} from "./router.ts";

test("Teaching & Learning input defaults arrays and rejects unknown fields", () => {
  const parsed = TeachingLearningInput.parse({});
  expect(parsed.activeLearningStrategyIds).toEqual([]);
  expect(parsed.teachingMethodIds).toEqual([]);
  expect(
    TeachingLearningInput.safeParse({ email: "protected@example.com" }).success,
  ).toBe(false);
});

test("programme-wide roles bypass course ownership, lecturer roles do not", () => {
  expect(hasProgrammeWideRole(["admin"])).toBe(true);
  expect(hasProgrammeWideRole(["program_coordinator"])).toBe(true);
  expect(hasProgrammeWideRole(["lecturer"])).toBe(false);
});

test("review authorization allows editable states and locks submitted work", () => {
  expect(isEditableReviewStatus()).toBe(true);
  expect(isEditableReviewStatus("draft")).toBe(true);
  expect(isEditableReviewStatus("changesRequested")).toBe(true);
  expect(isEditableReviewStatus("submitted")).toBe(false);
  expect(isEditableReviewStatus("underReview")).toBe(false);
  expect(isEditableReviewStatus("resubmitted")).toBe(false);
  expect(isEditableReviewStatus("approved")).toBe(false);
});
