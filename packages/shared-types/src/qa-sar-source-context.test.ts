import { describe, expect, test } from "bun:test";
import { QaSarRequirementSourceContextSchema } from "./qa-sar-source-context.ts";

describe("QA SAR PMS source context contract", () => {
  test("accepts explicit available and unavailable source blocks with provenance", () => {
    const parsed = QaSarRequirementSourceContextSchema.parse({
      programmeId: "dse",
      cycleId: "cycle-1",
      requirementCode: "8.1",
      requirementTitle: "Completion, dropout, and time-to-graduate performance",
      requirementText: "Completion, dropout, and time-to-graduate performance",
      diagnosticPrompts: ["Analyse trends across reporting periods."],
      evidenceGapState: "potentialEvidenceGap",
      evidenceGapExplanation: "Longitudinal evidence is incomplete.",
      generatedAt: "2026-08-26T00:00:00.000Z",
      sourceBlocks: [
        {
          id: "sar-source:students",
          registryKey: "expected-evidence:students",
          kind: "trend",
          title: "Student completion trend",
          description: "Completion by cohort",
          availability: "available",
          reportingPeriod: {
            start: "2023-01-01T00:00:00.000Z",
            end: "2026-12-31T00:00:00.000Z",
            label: "2023–2026",
          },
          generatedAt: "2026-08-26T00:00:00.000Z",
          snapshotKey: "students:v1",
          provenance: [
            {
              sourceDomain: "students",
              entityType: "StudentCohort",
              entityId: "cohort-2023",
              route: "/students",
              authority: "officialInstitutionalRecord",
              ownerUnit: "DSE",
              version: null,
              approvalStatus: null,
            },
          ],
          message: null,
          unit: "%",
          points: [{ period: "2023", value: 92 }],
        },
        {
          id: "sar-source:employment",
          registryKey: "expected-evidence:employment",
          kind: "recordList",
          title: "Graduate employment",
          description: "Employment evidence",
          availability: "unavailable",
          reportingPeriod: { start: null, end: null, label: null },
          generatedAt: "2026-08-26T00:00:00.000Z",
          snapshotKey: "employment:unavailable",
          provenance: [],
          message: "No canonical PMS source is available.",
          records: [],
        },
      ],
    });

    expect(parsed.sourceBlocks).toHaveLength(2);
    expect(parsed.sourceBlocks[1]?.availability).toBe("unavailable");
  });

  test("rejects a block without a reproducible snapshot key", () => {
    expect(() =>
      QaSarRequirementSourceContextSchema.parse({
        programmeId: "dse",
        cycleId: "cycle-1",
        requirementCode: "1.1",
        requirementTitle: "Requirement",
        requirementText: "Requirement",
        diagnosticPrompts: [],
        evidenceGapState: null,
        evidenceGapExplanation: null,
        generatedAt: "2026-08-26T00:00:00.000Z",
        sourceBlocks: [{
          id: "x",
          registryKey: "x",
          kind: "recordList",
          title: "x",
          description: "",
          availability: "unavailable",
          reportingPeriod: { start: null, end: null, label: null },
          generatedAt: "2026-08-26T00:00:00.000Z",
          snapshotKey: "",
          provenance: [],
          message: null,
          records: [],
        }],
      }),
    ).toThrow();
  });
});
