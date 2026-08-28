import { describe, expect, test } from "bun:test";
import {
  CreateQaSarBookSectionReviewSchema,
  QaSarBookReviewReadinessViewSchema,
} from "./qa-sar-book-review.ts";

describe("SAR book review contracts", () => {
  test("requires an exact revision for static-section review", () => {
    expect(
      CreateQaSarBookSectionReviewSchema.safeParse({
        programmeId: "dse",
        revisionId: "not-a-revision",
        decision: "changesRequested",
        comment: "Clarify the evidence used here.",
      }).success,
    ).toBe(false);
  });

  test("labels whole-book state as workflow readiness rather than compliance", () => {
    const parsed = QaSarBookReviewReadinessViewSchema.parse({
      programmeId: "dse",
      cycleId: "cycle-1",
      generatedAt: new Date().toISOString(),
      readyForFinalisation: false,
      note: "Workflow readiness only — not an AUN-QA compliance score or accreditation verdict.",
      parts: [
        { part: "part1", title: "Part 1", total: 1, ready: 0, blockers: 1 },
        { part: "part2", title: "Part 2", total: 53, ready: 0, blockers: 53 },
        { part: "part3", title: "Part 3", total: 1, ready: 0, blockers: 1 },
        { part: "part4", title: "Part 4", total: 1, ready: 0, blockers: 1 },
      ],
      staticSections: [],
      criteria: [],
      blockers: [],
    });
    expect(parsed.note).toContain("not an AUN-QA compliance score");
  });
});
