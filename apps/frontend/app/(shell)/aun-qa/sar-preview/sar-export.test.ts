import { expect, test } from "bun:test";
import type { QaSarDocumentModelView } from "@dse-pms/shared-types";
import { sarDocumentLines, sarEvidenceNumberMap } from "./sar-export";

const model: QaSarDocumentModelView = {
  programmeId: "dse",
  programmeCode: "DSE",
  programmeName: "Data Science and Engineering",
  cycleId: "cycle-1",
  cycleTitle: "AUN-QA 2026",
  reportingStart: "2025-01-01T00:00:00.000Z",
  reportingEnd: "2026-01-01T00:00:00.000Z",
  mode: "official",
  generatedAt: "2026-08-15T00:00:00.000Z",
  totals: { requiredSections: 2, includedSections: 2, approvedSections: 2, missingSections: 0 },
  criteria: [
    {
      code: "8",
      title: "Output and Outcomes",
      sections: [
        {
          requirementCode: "8.1",
          requirementTitle: "Pass rates",
          status: "approved",
          submissionId: "s1",
          submissionVersion: 1,
          plainText: "Pass rates are monitored.",
          evidenceIds: ["e1"],
          content: { version: 1, blocks: [
            { id: "p1", type: "paragraph", text: "Pass rates are monitored." },
            { id: "r1", type: "evidenceReference", evidenceId: "e1", label: "Graduate outcomes report" },
          ] },
        },
        {
          requirementCode: "8.2",
          requirementTitle: "Employability",
          status: "approved",
          submissionId: "s2",
          submissionVersion: 1,
          plainText: "Employability is monitored.",
          evidenceIds: ["e1"],
          content: { version: 1, blocks: [
            { id: "p2", type: "paragraph", text: "Employability is monitored." },
            { id: "r2", type: "evidenceReference", evidenceId: "e1", label: "Graduate outcomes report" },
          ] },
        },
      ],
    },
  ],
  evidenceRegister: [
    {
      evidenceId: "e1",
      title: "Graduate outcomes report",
      kind: "document",
      reportingPeriod: "2025",
      sourceRef: "Programme Office",
      sourceUrl: null,
      requirementCodes: ["8.1", "8.2"],
    },
  ],
};

test("SAR export assigns one stable number to reused canonical evidence", () => {
  const numbers = sarEvidenceNumberMap(model);
  expect(numbers.get("e1")).toBe("E001");
  expect(numbers.size).toBe(1);
});

test("SAR export lines reuse the same evidence number across sections and register", () => {
  const lines = sarDocumentLines(model);
  expect(lines.filter((line) => line.includes("[E001] Graduate outcomes report"))).toHaveLength(2);
  expect(lines.some((line) => line.startsWith("E001 — Graduate outcomes report"))).toBe(true);
  expect(lines.join("\n")).not.toContain("E002");
});
