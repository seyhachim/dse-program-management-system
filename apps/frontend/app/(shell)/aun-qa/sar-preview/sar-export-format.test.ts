import { expect, test } from "bun:test";
import type { QaSarDocumentModelView } from "@dse-pms/shared-types";
import { sarDocumentLines } from "./sar-export";

function model(mode: "working" | "official"): QaSarDocumentModelView {
  return {
    programmeId: "dse",
    programmeCode: "DSE",
    programmeName: "Data Science and Engineering",
    cycleId: "cycle-1",
    cycleTitle: "AUN-QA 2026",
    reportingStart: "2025-01-01T00:00:00.000Z",
    reportingEnd: "2026-01-01T00:00:00.000Z",
    mode,
    generatedAt: "2026-08-15T00:00:00.000Z",
    totals: { requiredSections: 1, includedSections: 0, approvedSections: 0, missingSections: 1 },
    criteria: [
      {
        code: "1",
        title: "Expected Learning Outcomes",
        sections: [
          {
            requirementCode: "1.1",
            requirementTitle: "Programme learning outcomes",
            status: "missing",
            submissionId: null,
            submissionVersion: null,
            content: null,
            plainText: "",
            evidenceIds: [],
          },
        ],
      },
    ],
    evidenceRegister: [],
  };
}

test("working export is explicitly marked as a draft", () => {
  expect(sarDocumentLines(model("working"))).toContain("WORKING DRAFT");
});

test("official export identifies missing approved content rather than substituting a draft", () => {
  const lines = sarDocumentLines(model("official"));
  expect(lines).toContain("OFFICIAL SAR");
  expect(lines).toContain("[No approved submission; excluded from official SAR]");
});
