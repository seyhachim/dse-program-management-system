import { expect, test } from "bun:test";
import {
  CreateQaImprovementActionSchema,
  QaImprovementActionStatusSchema,
  UpdateQaImprovementActionSchema,
} from "./index.ts";

const ids = {
  cycleId: "123e4567-e89b-12d3-a456-426614174000",
  analysisId: "223e4567-e89b-12d3-a456-426614174000",
  reviewId: "323e4567-e89b-12d3-a456-426614174000",
};

test("CQI action status exposes an explicit operational lifecycle", () => {
  expect(QaImprovementActionStatusSchema.options).toEqual([
    "open",
    "inProgress",
    "completed",
    "cancelled",
  ]);
});

test("CQI action creation requires validated finding provenance and an indicator", () => {
  expect(
    CreateQaImprovementActionSchema.safeParse({
      programmeId: "dse",
      ...ids,
      plannedAction: "Collect and approve the missing curriculum review evidence.",
      indicator: "Signed review minutes are attached and reviewed.",
    }).success,
  ).toBe(true);
  expect(
    CreateQaImprovementActionSchema.safeParse({
      programmeId: "dse",
      ...ids,
      plannedAction: "too short",
      indicator: "ok",
    }).success,
  ).toBe(false);
});

test("closing a CQI action requires both result and effectiveness review", () => {
  expect(
    UpdateQaImprovementActionSchema.safeParse({
      programmeId: "dse",
      status: "completed",
      result: "The evidence package was completed and approved.",
      effectivenessReview: "The next QA review confirmed the documentation is usable and current.",
    }).success,
  ).toBe(true);
  expect(
    UpdateQaImprovementActionSchema.safeParse({
      programmeId: "dse",
      status: "completed",
      result: "The evidence package was completed and approved.",
    }).success,
  ).toBe(false);
});
