import { describe, expect, test } from "bun:test";
import {
  QA_SAR_BOOK_STATIC_PARTS,
  QA_SAR_BOOK_TEMPLATE_VERSION,
  QaSarBookViewSchema,
} from "./qa-sar-book.ts";

describe("AUN-QA SAR book contracts", () => {
  test("keeps the complete static Part 1/3/4 section order stable", () => {
    expect(QA_SAR_BOOK_STATIC_PARTS.map((part) => part.id)).toEqual(["part1", "part3", "part4"]);
    expect(QA_SAR_BOOK_STATIC_PARTS.flatMap((part) => part.sections.map((section) => section.key))).toEqual([
      "part1.executive-summary",
      "part1.self-assessment-organisation",
      "part1.programme-background",
      "part3.strengths",
      "part3.weaknesses",
      "part3.self-ratings",
      "part3.improvement-plan",
      "part4.glossary",
      "part4.evidence-register",
      "part4.supporting-documents",
    ]);
  });

  test("validates one complete four-part SAR book with pinned release lineage", () => {
    const result = QaSarBookViewSchema.parse({
      bookId: "qa-sar-book:cycle-1",
      templateVersion: QA_SAR_BOOK_TEMPLATE_VERSION,
      programmeId: "dse",
      cycleId: "cycle-1",
      cycleTitle: "AUN-QA 2026",
      framework: {
        id: "aun-qa-v4",
        code: "AUN-QA",
        name: "AUN-QA Programme Assessment",
        version: "4.0",
      },
      parts: [
        {
          id: "part1",
          title: "Part 1 — Introduction",
          order: 1,
          sections: [],
          criteria: [],
        },
        {
          id: "part2",
          title: "Part 2 — AUN-QA Criteria",
          order: 2,
          sections: [],
          criteria: [
            {
              id: "criterion-1",
              code: "1",
              title: "Expected Learning Outcomes",
              order: 1,
              sections: [
                {
                  id: "part2.requirement:req-1-1",
                  key: "part2.1.1",
                  title: "Requirement 1.1",
                  order: 1,
                  required: true,
                  source: "requirementSar",
                  requirementId: "req-1-1",
                  requirementCode: "1.1",
                },
              ],
            },
          ],
        },
        {
          id: "part3",
          title: "Part 3 — Strengths and Weaknesses Analysis",
          order: 3,
          sections: [],
          criteria: [],
        },
        {
          id: "part4",
          title: "Part 4 — Appendices",
          order: 4,
          sections: [],
          criteria: [],
        },
      ],
      totals: { parts: 4, criteria: 1, requirements: 1, staticSections: 0 },
      lineage: [
        {
          releaseId: "release-1",
          releaseVersion: 1,
          title: "Official SAR",
          templateVersion: "aun-qa-sar-v1",
          finalizedAt: "2026-08-26T00:00:00.000Z",
          sourceSubmissionIds: ["submission-1"],
          requirementPins: [
            {
              requirementCode: "1.1",
              submissionId: "submission-1",
              submissionVersion: 2,
            },
          ],
        },
      ],
    });

    expect(result.parts).toHaveLength(4);
    expect(result.lineage[0]?.requirementPins[0]?.submissionVersion).toBe(2);
  });

  test("rejects a non-canonical book template version", () => {
    expect(() =>
      QaSarBookViewSchema.parse({
        bookId: "qa-sar-book:cycle-1",
        templateVersion: "custom-template",
        programmeId: "dse",
        cycleId: "cycle-1",
        cycleTitle: "AUN-QA 2026",
        framework: { id: "f", code: "AUN-QA", name: "AUN-QA", version: "4.0" },
        parts: [],
        totals: { parts: 4, criteria: 0, requirements: 0, staticSections: 0 },
        lineage: [],
      }),
    ).toThrow();
  });
});
