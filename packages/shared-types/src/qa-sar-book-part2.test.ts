import { describe, expect, test } from "bun:test";
import { QaSarBookPart2ViewSchema } from "./qa-sar-book-part2.ts";

const emptyDocument = { version: 1 as const, blocks: [] };

describe("SAR book Part 2 contract", () => {
  test("preserves exact approved submission IDs and versions separately from current content", () => {
    const parsed = QaSarBookPart2ViewSchema.parse({
      programmeId: "dse",
      cycleId: "cycle-1",
      generatedAt: "2026-08-26T00:00:00.000Z",
      totals: {
        total: 1,
        notStarted: 0,
        draft: 1,
        submitted: 0,
        changesRequested: 0,
        approved: 0,
        unassigned: 0,
        brokenEvidenceReferences: 0,
      },
      criteria: [
        {
          criterionId: "criterion-1",
          criterionCode: "1",
          criterionTitle: "Expected Learning Outcomes",
          order: 1,
          rollup: {
            total: 1,
            notStarted: 0,
            draft: 1,
            submitted: 0,
            changesRequested: 0,
            approved: 0,
            unassigned: 0,
            brokenEvidenceReferences: 0,
          },
          requirements: [
            {
              requirementId: "requirement-1-1",
              requirementCode: "1.1",
              requirementTitle: "Requirement 1.1",
              order: 1,
              workflowStatus: "draft",
              assignment: {
                assignmentId: "assignment-1",
                assignee: {
                  id: "user-1",
                  name: "Contributor",
                  email: "contributor@dse.invalid",
                },
              },
              currentSource: {
                kind: "current",
                sectionId: "section-1",
                submissionId: null,
                submissionVersion: null,
                content: emptyDocument,
                plainText: "New draft",
                evidenceIds: [],
                capturedAt: "2026-08-26T00:00:00.000Z",
              },
              latestSubmission: {
                kind: "submission",
                sectionId: "section-1",
                submissionId: "submission-1",
                submissionVersion: 1,
                content: emptyDocument,
                plainText: "Approved text",
                evidenceIds: [],
                capturedAt: "2026-08-25T00:00:00.000Z",
              },
              approvedSubmission: {
                kind: "approvedSubmission",
                sectionId: "section-1",
                submissionId: "submission-1",
                submissionVersion: 1,
                content: emptyDocument,
                plainText: "Approved text",
                evidenceIds: [],
                capturedAt: "2026-08-25T00:00:00.000Z",
              },
              officialPin: { submissionId: "submission-1", submissionVersion: 1 },
              brokenEvidenceReferenceIds: [],
            },
          ],
        },
      ],
    });

    const requirement = parsed.criteria[0]?.requirements[0];
    expect(requirement?.currentSource?.plainText).toBe("New draft");
    expect(requirement?.officialPin).toEqual({
      submissionId: "submission-1",
      submissionVersion: 1,
    });
  });
});
