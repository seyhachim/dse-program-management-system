import { expect, test } from "bun:test";
import {
  QaRequirementAssignmentScopeSchema,
  UpsertQaRequirementAssignmentSchema,
} from "./qa-assignments.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

test("QA requirement assignment accepts one programme-scoped contributor", () => {
  const parsed = UpsertQaRequirementAssignmentSchema.parse({
    programmeId: "dse",
    assigneeId: USER_ID,
  });

  expect(parsed).toEqual({ programmeId: "dse", assigneeId: USER_ID });
});

test("QA requirement assignment rejects an invalid assignee id", () => {
  expect(
    UpsertQaRequirementAssignmentSchema.safeParse({
      programmeId: "dse",
      assigneeId: "not-a-user-id",
    }).success,
  ).toBe(false);
});

test("QA assignment scope requires an explicit programme", () => {
  expect(QaRequirementAssignmentScopeSchema.safeParse({ programmeId: "" }).success).toBe(false);
  expect(QaRequirementAssignmentScopeSchema.safeParse({ programmeId: "dse" }).success).toBe(true);
});
