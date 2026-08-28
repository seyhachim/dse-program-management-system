import { describe, expect, test } from "bun:test";
import {
  AddQaSarBookSectionEvidenceReferenceSchema,
  DEFAULT_QA_SAR_BOOK_TERMINOLOGY,
  QaSarBookEvidenceRegisterQuerySchema,
  QaSarBookEvidenceRegisterViewSchema,
  UpdateQaSarBookTerminologySchema,
} from "./index.ts";

const evidenceId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";

describe("SAR book evidence contracts", () => {
  test("defaults evidence register to working mode", () => {
    expect(QaSarBookEvidenceRegisterQuerySchema.parse({ programmeId: "dse" })).toEqual({
      programmeId: "dse",
      mode: "working",
    });
  });

  test("uses programme-managed terminology without changing semantic references", () => {
    const parsed = UpdateQaSarBookTerminologySchema.parse({
      programmeId: "dse",
      terminology: {
        ...DEFAULT_QA_SAR_BOOK_TERMINOLOGY,
        evidenceCitationLabel: "Exhibition",
      },
    });
    expect(parsed.terminology.evidenceCitationLabel).toBe("Exhibition");
    expect(parsed.terminology.evidenceRegisterTitle).toBe("List of Exhibits");
  });

  test("requires exact static-section revision identity for evidence insertion", () => {
    expect(
      AddQaSarBookSectionEvidenceReferenceSchema.parse({
        programmeId: "dse",
        evidenceId,
        revisionId,
      }),
    ).toEqual({ programmeId: "dse", evidenceId, revisionId, appendixGroup: "other" });
    expect(() =>
      AddQaSarBookSectionEvidenceReferenceSchema.parse({
        programmeId: "dse",
        evidenceId,
        revisionId: "latest",
      }),
    ).toThrow();
  });

  test("validates deterministic register rows with multiple usages", () => {
    expect(
      QaSarBookEvidenceRegisterViewSchema.parse({
        programmeId: "dse",
        cycleId: "cycle-1",
        terminology: DEFAULT_QA_SAR_BOOK_TERMINOLOGY,
        generatedAt: "2026-08-28T00:00:00.000Z",
        issues: [],
        items: [
          {
            evidenceId,
            title: "Approved curriculum mapping",
            kind: "systemLink",
            status: "reviewed",
            reportingPeriod: "2026",
            sourceRef: "curriculum:active",
            sourceUrl: null,
            appendixGroup: "curriculum",
            number: "1.1-01",
            citationLabel: "Exhibit",
            citationText: "Exhibit 1.1-01",
            usages: [
              {
                part: "part2",
                sectionKey: "part2.1.1",
                sectionTitle: "Expected learning outcomes",
                requirementCode: "1.1",
                submissionId: revisionId,
                revisionId: null,
              },
              {
                part: "part3",
                sectionKey: "part3.strengths",
                sectionTitle: "Summary of Strengths",
                requirementCode: null,
                submissionId: null,
                revisionId,
              },
            ],
          },
        ],
      }),
    ).toBeTruthy();
  });
});
