import { expect, test } from "bun:test";
import {
  EMPTY_QA_SAR_DOCUMENT,
  QaSarDocumentSchema,
  SaveQaSarSectionSchema,
} from "./qa-sar.ts";

test("SAR document stores continuous semantic writing blocks", () => {
  const parsed = QaSarDocumentSchema.parse({
    version: 1,
    blocks: [
      { id: "p1", type: "paragraph", text: "The programme reviews stakeholder feedback annually." },
      { id: "e1", type: "evidenceReference", evidenceId: "evidence-1", label: "Employer Survey 2025" },
      { id: "p2", type: "paragraph", text: "The findings informed curriculum improvement." },
      { id: "d1", type: "pmsData", source: "stakeholderFeedback", label: "Stakeholder feedback summary" },
    ],
  });

  expect(parsed.blocks).toHaveLength(4);
  expect(parsed.blocks[1]?.type).toBe("evidenceReference");
  expect(parsed.blocks[3]?.type).toBe("pmsData");
});

test("SAR save keeps author readiness separate from content", () => {
  const parsed = SaveQaSarSectionSchema.parse({
    programmeId: "dse",
    content: EMPTY_QA_SAR_DOCUMENT,
    readiness: {
      practiceDescribed: true,
      resultsAnalysed: false,
      improvementExplained: false,
    },
  });

  expect(parsed.readiness.practiceDescribed).toBe(true);
  expect(parsed.content.version).toBe(1);
});

test("SAR semantic blocks reject unsupported arbitrary document nodes", () => {
  const result = QaSarDocumentSchema.safeParse({
    version: 1,
    blocks: [{ id: "x", type: "fontSize", value: 22 }],
  });

  expect(result.success).toBe(false);
});

test("SAR evidence references require a stable evidence id and display label", () => {
  const missingEvidenceId = QaSarDocumentSchema.safeParse({
    version: 1,
    blocks: [{ id: "e1", type: "evidenceReference", evidenceId: "", label: "Employer Survey 2025" }],
  });
  const missingLabel = QaSarDocumentSchema.safeParse({
    version: 1,
    blocks: [{ id: "e1", type: "evidenceReference", evidenceId: "evidence-1", label: "" }],
  });

  expect(missingEvidenceId.success).toBe(false);
  expect(missingLabel.success).toBe(false);
});
