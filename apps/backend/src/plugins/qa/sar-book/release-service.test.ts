import { describe, expect, test } from "bun:test";
import type { QaSarBookDocument } from "@dse-pms/shared-types";
import {
  QaSarBookReleaseNotReadyError,
  assertQaSarBookFinalizable,
} from "./release-service.ts";

function finalizableDocument(): QaSarBookDocument {
  return {
    readiness: {
      readyForFinalisation: true,
      blockers: [],
      staticSections: [
        {
          required: true,
          source: "bookNarrative",
          sectionKey: "part1.executive-summary",
          sectionTitle: "Executive Summary",
          reviewStatus: "approved",
          revisionId: "00000000-0000-4000-8000-000000000001",
          revisionNumber: 3,
        },
      ],
    },
    sourceIndex: {
      narrativePins: [
        {
          sectionKey: "part1.executive-summary",
          revisionId: "00000000-0000-4000-8000-000000000001",
          revisionNumber: 3,
        },
      ],
    },
    part2: {
      criteria: [
        {
          requirements: [
            {
              sourceKind: "approvedSubmission",
              submissionId: "00000000-0000-4000-8000-000000000002",
              submissionVersion: 4,
            },
          ],
        },
      ],
    },
    part4: { evidenceRegister: { issues: [] } },
  } as unknown as QaSarBookDocument;
}

describe("SAR book official release guard", () => {
  test("accepts a clean release whose narrative pins match approved readiness", () => {
    expect(() => assertQaSarBookFinalizable(finalizableDocument())).not.toThrow();
  });

  test("fails closed if a narrative revision changes after readiness was captured", () => {
    const document = finalizableDocument();
    document.sourceIndex.narrativePins[0]!.revisionNumber = 4;

    expect(() => assertQaSarBookFinalizable(document)).toThrow(
      QaSarBookReleaseNotReadyError,
    );
  });

  test("fails closed if Part 2 does not pin an approved submission", () => {
    const document = finalizableDocument();
    document.part2.criteria[0]!.requirements[0]!.sourceKind = "submission";

    expect(() => assertQaSarBookFinalizable(document)).toThrow(
      "Every Part 2 requirement must pin an approved submission before finalisation",
    );
  });

  test("fails closed when the evidence register still has integrity issues", () => {
    const document = finalizableDocument();
    document.part4.evidenceRegister.issues = [
      {
        type: "missingEvidence",
        evidenceId: "00000000-0000-4000-8000-000000000003",
        sectionKey: "part2.1.1",
        requirementCode: "1.1",
        message: "Evidence is missing",
      },
    ];

    expect(() => assertQaSarBookFinalizable(document)).toThrow(
      "Evidence Register has 1 unresolved issue(s)",
    );
  });
});
