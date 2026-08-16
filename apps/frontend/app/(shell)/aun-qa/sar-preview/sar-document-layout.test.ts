import { describe, expect, test } from "bun:test";
import type { QaSarDocumentModelView } from "@dse-pms/shared-types";
import { buildSarDocumentLayout } from "./sar-document-layout";
import { sarDocumentLines } from "./sar-export";

const model: QaSarDocumentModelView = {
  programmeId: "dse",
  programmeCode: "DSE",
  programmeName: "Data Science and Engineering",
  cycleId: "cycle-1",
  cycleTitle: "AUN-QA 2026",
  reportingStart: "2025-01-01T00:00:00.000Z",
  reportingEnd: "2026-01-01T00:00:00.000Z",
  mode: "official",
  generatedAt: "2026-08-16T00:00:00.000Z",
  totals: { requiredSections: 1, includedSections: 1, approvedSections: 1, missingSections: 0 },
  criteria: [
    {
      code: "8",
      title: "Output and Outcomes",
      sections: [
        {
          requirementCode: "8.1",
          requirementTitle: "Pass rates",
          status: "approved",
          submissionId: "submission-1",
          submissionVersion: 3,
          plainText: "Pass rates are monitored.",
          evidenceIds: ["e1"],
          content: {
            version: 1,
            blocks: [
              { id: "p1", type: "paragraph", text: "Pass rates are monitored." },
              { id: "e1-ref", type: "evidenceReference", evidenceId: "e1", label: "Graduate outcomes report" },
              { id: "pms-1", type: "pmsData", source: "assessmentSummary", label: "Assessment summary" },
            ],
          },
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
      requirementCodes: ["8.1"],
    },
  ],
};

describe("SAR canonical document layout", () => {
  test("carries the same section metadata needed by preview and export", () => {
    const layout = buildSarDocumentLayout(model);
    const section = layout.criteria[0]!.sections[0]!;

    expect(layout.modeLabel).toBe("OFFICIAL SAR");
    expect(section.statusLabel).toBe("Approved");
    expect(section.submissionLabel).toBe("Approved submission v3");
    expect(section.blocks.find((block) => block.type === "evidenceReference")?.text).toBe(
      "[E001] Graduate outcomes report",
    );
    expect(section.blocks.find((block) => block.type === "pmsData")?.text).toBe(
      "[PMS data] Assessment summary",
    );
    expect(layout.evidenceRows[0]).toMatchObject({
      number: "E001",
      title: "Graduate outcomes report",
      requirementCodes: "8.1",
      source: "Programme Office",
    });
  });

  test("text export is derived from the canonical layout metadata", () => {
    const lines = sarDocumentLines(model);

    expect(lines).toContain("Status: Approved");
    expect(lines).toContain("Approved submission v3");
    expect(lines).toContain("[E001] Graduate outcomes report");
    expect(lines).toContain("[PMS data] Assessment summary");
  });
});
