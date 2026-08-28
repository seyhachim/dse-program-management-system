import { describe, expect, test } from "bun:test";
import type { QaSarBookEvidenceRegisterItem } from "@dse-pms/shared-types";
import { assignDeterministicExhibitNumbers } from "./evidence-register-service.ts";

type Unnumbered = Omit<QaSarBookEvidenceRegisterItem, "number" | "citationLabel" | "citationText">;

function row(evidenceId: string, requirementCode: string): Unnumbered {
  return {
    evidenceId,
    title: `Evidence ${evidenceId}`,
    kind: "systemLink",
    status: "reviewed",
    reportingPeriod: "2026",
    sourceRef: `ref:${evidenceId}`,
    sourceUrl: null,
    appendixGroup: "other",
    usages: [
      {
        part: "part2",
        sectionKey: `part2.${requirementCode}`,
        sectionTitle: `Requirement ${requirementCode}`,
        requirementCode,
        submissionId: null,
        revisionId: null,
      },
    ],
  };
}

describe("SAR book exhibit numbering", () => {
  test("is stable regardless of input order and separates requirement sequences", () => {
    const a = row("11111111-1111-4111-8111-111111111111", "1.1");
    const b = row("22222222-2222-4222-8222-222222222222", "1.1");
    const c = row("33333333-3333-4333-8333-333333333333", "1.2");

    const forward = assignDeterministicExhibitNumbers([b, c, a], "Exhibit");
    const reverse = assignDeterministicExhibitNumbers([a, c, b], "Exhibit");

    expect(forward.map((item) => [item.evidenceId, item.number])).toEqual(
      reverse.map((item) => [item.evidenceId, item.number]),
    );
    expect(forward.map((item) => item.number)).toEqual(["1.1-01", "1.1-02", "1.2-01"]);
    expect(forward[0]?.citationText).toBe("Exhibit 1.1-01");
  });

  test("uses stable part prefixes for shared book sections", () => {
    const staticRow: Unnumbered = {
      ...row("44444444-4444-4444-8444-444444444444", "1.1"),
      usages: [
        {
          part: "part1",
          sectionKey: "part1.executive-summary",
          sectionTitle: "Executive Summary",
          requirementCode: null,
          submissionId: null,
          revisionId: "55555555-5555-4555-8555-555555555555",
        },
      ],
    };
    expect(assignDeterministicExhibitNumbers([staticRow], "Exhibition")[0]).toMatchObject({
      number: "P1-01",
      citationText: "Exhibition P1-01",
    });
  });
});
