import { describe, expect, test } from "bun:test";
import { buildQaSarBookParts, extractQaSarBookRequirementPins } from "./service.ts";

describe("QA SAR book foundation", () => {
  test("assembles four parts deterministically from framework criteria", () => {
    const parts = buildQaSarBookParts([
      {
        id: "criterion-2",
        code: "2",
        title: "Programme Structure and Content",
        order: 2,
        requirements: [
          { id: "req-2-2", code: "2.2", title: "Requirement 2.2", order: 2 },
          { id: "req-2-1", code: "2.1", title: "Requirement 2.1", order: 1 },
        ],
      },
      {
        id: "criterion-1",
        code: "1",
        title: "Expected Learning Outcomes",
        order: 1,
        requirements: [
          { id: "req-1-1", code: "1.1", title: "Requirement 1.1", order: 1 },
        ],
      },
    ]);

    expect(parts.map((part) => part.id)).toEqual(["part1", "part2", "part3", "part4"]);
    expect(parts[1]?.criteria.map((criterion) => criterion.code)).toEqual(["1", "2"]);
    expect(parts[1]?.criteria[1]?.sections.map((section) => section.requirementCode)).toEqual(["2.1", "2.2"]);
    expect(parts[1]?.criteria[0]?.sections[0]).toMatchObject({
      id: "part2.requirement:req-1-1",
      key: "part2.1.1",
      source: "requirementSar",
      requirementId: "req-1-1",
    });
  });

  test("uses stable template keys for authorable and generated non-criterion sections", () => {
    const parts = buildQaSarBookParts([]);
    expect(parts[0]?.sections.map((section) => section.id)).toEqual([
      "part1.executive-summary",
      "part1.self-assessment-organisation",
      "part1.programme-background",
    ]);
    expect(parts[2]?.sections.map((section) => section.id)).toEqual([
      "part3.strengths",
      "part3.weaknesses",
      "part3.self-ratings",
      "part3.improvement-plan",
    ]);
    expect(parts[3]?.sections.map((section) => [section.id, section.source])).toEqual([
      ["part4.glossary", "bookNarrative"],
      ["part4.evidence-register", "generated"],
      ["part4.supporting-documents", "structured"],
    ]);
  });

  test("extracts exact immutable requirement submission pins from legacy releases", () => {
    const pins = extractQaSarBookRequirementPins({
      criteria: [
        {
          sections: [
            {
              requirementCode: "2.1",
              submissionId: "submission-21",
              submissionVersion: 3,
            },
            {
              requirementCode: "1.1",
              submissionId: "submission-11",
              submissionVersion: 2,
            },
          ],
        },
      ],
    });

    expect(pins).toEqual([
      { requirementCode: "1.1", submissionId: "submission-11", submissionVersion: 2 },
      { requirementCode: "2.1", submissionId: "submission-21", submissionVersion: 3 },
    ]);
  });

  test("extracts pins from the immutable full-book release source index", () => {
    const pins = extractQaSarBookRequirementPins({
      sourceIndex: {
        requirementPins: [
          { requirementCode: "2.2", submissionId: "submission-22", submissionVersion: 5 },
          { requirementCode: "1.1", submissionId: "submission-11", submissionVersion: 4 },
        ],
      },
    });

    expect(pins).toEqual([
      { requirementCode: "1.1", submissionId: "submission-11", submissionVersion: 4 },
      { requirementCode: "2.2", submissionId: "submission-22", submissionVersion: 5 },
    ]);
  });

  test("does not invent pins for malformed historical snapshots", () => {
    expect(extractQaSarBookRequirementPins({ criteria: [{ sections: [{ requirementCode: "1.1" }] }] })).toEqual([]);
  });
});