import { expect, test } from "bun:test";
import { CreateQaSarReviewSchema, QaSarReviewDecisionSchema } from "./qa-sar-review.ts";

test("SAR approval may be recorded without a required comment", () => {
  const parsed = CreateQaSarReviewSchema.parse({
    programmeId: "dse",
    decision: "approved",
    comment: "",
  });
  expect(parsed.decision).toBe("approved");
});

test("SAR changes requested requires an explanatory comment", () => {
  const result = CreateQaSarReviewSchema.safeParse({
    programmeId: "dse",
    decision: "changesRequested",
    comment: "",
  });
  expect(result.success).toBe(false);
});

test("SAR more-evidence request requires an explanatory comment", () => {
  const result = CreateQaSarReviewSchema.safeParse({
    programmeId: "dse",
    decision: "moreEvidenceRequested",
    comment: "Please add the alumni follow-up report.",
  });
  expect(result.success).toBe(true);
});

test("SAR human-review decisions do not contain numeric AUN-QA scoring states", () => {
  expect(QaSarReviewDecisionSchema.options).toEqual([
    "approved",
    "changesRequested",
    "moreEvidenceRequested",
  ]);
  expect(QaSarReviewDecisionSchema.safeParse("5/7").success).toBe(false);
});
