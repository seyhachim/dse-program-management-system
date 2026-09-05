import { expect, test } from "bun:test";
import { ResearchProjectPageQuerySchema } from "./action-research-pagination.ts";

test("Action Research project page shared contract is bounded", () => {
  expect(ResearchProjectPageQuerySchema.parse({ programmeId: "dse" })).toEqual({
    programmeId: "dse",
    limit: 50,
  });
  expect(
    ResearchProjectPageQuerySchema.parse({ programmeId: "dse", limit: "100" }).limit,
  ).toBe(100);
  expect(
    ResearchProjectPageQuerySchema.safeParse({ programmeId: "dse", limit: 0 }).success,
  ).toBe(false);
  expect(
    ResearchProjectPageQuerySchema.safeParse({ programmeId: "dse", limit: 101 }).success,
  ).toBe(false);
});
