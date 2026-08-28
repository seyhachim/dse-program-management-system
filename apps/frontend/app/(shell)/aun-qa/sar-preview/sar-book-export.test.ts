import { describe, expect, test } from "bun:test";
import type { QaSarBookDocument } from "@dse-pms/shared-types";
import { sarBookDocumentLines, sarBookExportBaseName } from "./sar-book-export";

function fixture(): QaSarBookDocument {
  return {
    schemaVersion: "aun-qa-v4-sar-book-v1-release-v1",
    bookTemplateVersion: "aun-qa-v4-sar-book-v1",
    mode: "released",
    generatedAt: "2026-08-29T00:00:00.000Z",
    release: {
      id: "00000000-0000-4000-8000-000000000001",
      version: 2,
      title: "DSE SAR",
      finalizedAt: "2026-08-29T00:00:00.000Z",
      finalizedBy: { id: "00000000-0000-4000-8000-000000000002", name: "Programme Head" },
    },
    programme: { id: "dse", code: "DSE", name: "Data Science and Engineering" },
    cycle: {
      id: "cycle-1",
      title: "2026-2027",
      reportingStart: "2026-01-01T00:00:00.000Z",
      reportingEnd: "2026-12-31T00:00:00.000Z",
    },
    framework: { id: "framework-1", code: "AUN-QA", name: "AUN-QA", version: "4.0" },
    toc: [
      { id: "part1", number: "1", title: "Part 1 — Introduction", level: 1, part: "part1", requirementCode: null },
      { id: "part2", number: "2", title: "Part 2 — AUN-QA Criteria", level: 1, part: "part2", requirementCode: null },
      { id: "part3", number: "3", title: "Part 3 — Strengths and Weaknesses Analysis", level: 1, part: "part3", requirementCode: null },
      { id: "part4", number: "4", title: "Part 4 — Appendices", level: 1, part: "part4", requirementCode: null },
    ],
    part1: {
      title: "Part 1 — Introduction",
      sections: [{
        sectionKey: "part1.executive-summary",
        title: "Executive Summary",
        number: "1.1",
        revisionId: "00000000-0000-4000-8000-000000000003",
        revisionNumber: 4,
        content: "dse-doc-v1:{\"type\":\"doc\",\"content\":[]}",
        plainText: "Executive narrative",
      }],
    },
    part2: {
      title: "Part 2 — AUN-QA Criteria",
      criteria: [{
        criterionId: "criterion-1",
        criterionCode: "1",
        criterionTitle: "Expected Learning Outcomes",
        number: "2.1",
        requirements: [{
          criterionCode: "1",
          criterionTitle: "Expected Learning Outcomes",
          requirementId: "requirement-1",
          requirementCode: "1.1",
          requirementTitle: "Programme learning outcomes are established",
          number: "2.1.1",
          workflowStatus: "approved",
          sourceKind: "approvedSubmission",
          submissionId: "submission-1",
          submissionVersion: 3,
          content: null,
          plainText: "Approved requirement narrative",
          evidenceIds: [],
        }],
      }],
    },
    part3: {
      title: "Part 3 — Strengths and Weaknesses Analysis",
      strengths: {
        sectionKey: "part3.strengths",
        title: "Summary of Strengths",
        number: "3.1",
        revisionId: "00000000-0000-4000-8000-000000000004",
        revisionNumber: 2,
        content: "dse-doc-v1:{\"type\":\"doc\",\"content\":[]}",
        plainText: "Strengths narrative",
      },
      weaknesses: {
        sectionKey: "part3.weaknesses",
        title: "Summary of Weaknesses / Areas for Improvement",
        number: "3.2",
        revisionId: "00000000-0000-4000-8000-000000000005",
        revisionNumber: 2,
        content: "dse-doc-v1:{\"type\":\"doc\",\"content\":[]}",
        plainText: "Weaknesses narrative",
      },
      snapshot: {
        programmeId: "dse",
        cycleId: "00000000-0000-4000-8000-000000000006",
        capturedAt: "2026-08-29T00:00:00.000Z",
        note: "Human self-assessment only — ratings are not external assessor scores or an accreditation verdict.",
        criteria: [],
        associations: [],
        improvementActions: [],
      },
    },
    part4: {
      title: "Part 4 — Appendices",
      glossary: {
        sectionKey: "part4.glossary",
        title: "Glossary",
        number: "4.1",
        revisionId: "00000000-0000-4000-8000-000000000007",
        revisionNumber: 1,
        content: "dse-doc-v1:{\"type\":\"doc\",\"content\":[]}",
        plainText: "Glossary content",
      },
      evidenceRegister: {
        programmeId: "dse",
        cycleId: "cycle-1",
        terminology: {
          evidenceCitationLabel: "Exhibit",
          evidenceRegisterTitle: "List of Exhibits",
          appendixLabel: "Appendix",
          requirementLabel: "Requirement",
          criterionLabel: "Criterion",
        },
        items: [],
        issues: [],
        generatedAt: "2026-08-29T00:00:00.000Z",
      },
      supportingEvidenceIds: [],
    },
    readiness: {
      programmeId: "dse",
      cycleId: "cycle-1",
      generatedAt: "2026-08-29T00:00:00.000Z",
      readyForFinalisation: true,
      note: "Workflow readiness only — not an AUN-QA compliance score or accreditation verdict.",
      parts: [
        { part: "part1", title: "Part 1", total: 1, ready: 1, blockers: 0 },
        { part: "part2", title: "Part 2", total: 1, ready: 1, blockers: 0 },
        { part: "part3", title: "Part 3", total: 1, ready: 1, blockers: 0 },
        { part: "part4", title: "Part 4", total: 1, ready: 1, blockers: 0 },
      ],
      staticSections: [],
      criteria: [],
      blockers: [],
    },
    sourceIndex: {
      narrativePins: [],
      requirementPins: [{ requirementCode: "1.1", submissionId: "submission-1", submissionVersion: 3 }],
      evidenceIds: [],
      part3CapturedAt: "2026-08-29T00:00:00.000Z",
    },
  };
}

describe("SAR book export", () => {
  test("uses a deterministic official release filename", () => {
    expect(sarBookExportBaseName(fixture())).toBe("DSE-AUN-QA-SAR-2026-2027-release-v2");
  });

  test("projects all four parts in canonical order", () => {
    const lines = sarBookDocumentLines(fixture());
    const part1 = lines.indexOf("Part 1 — Introduction");
    const part2 = lines.indexOf("Part 2 — AUN-QA Criteria");
    const part3 = lines.indexOf("Part 3 — Strengths and Weaknesses Analysis");
    const part4 = lines.indexOf("Part 4 — Appendices");
    expect(part1).toBeGreaterThan(-1);
    expect(part2).toBeGreaterThan(part1);
    expect(part3).toBeGreaterThan(part2);
    expect(part4).toBeGreaterThan(part3);
    expect(lines).toContain("2.1.1 1.1 Programme learning outcomes are established");
  });
});
