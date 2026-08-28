import { describe, expect, test } from "bun:test";
import { EMPTY_QA_SAR_DOCUMENT, type QaSarBookPart2Requirement } from "@dse-pms/shared-types";
import {
  qaSarBookPart2WorkflowStatus,
  summarizeQaSarBookPart2,
} from "./part2-service.ts";

function requirement(
  code: string,
  workflowStatus: QaSarBookPart2Requirement["workflowStatus"],
  options?: { assigned?: boolean; brokenEvidence?: string[] },
): QaSarBookPart2Requirement {
  return {
    requirementId: `req-${code}`,
    requirementCode: code,
    requirementTitle: `Requirement ${code}`,
    order: 1,
    workflowStatus,
    assignment: options?.assigned
      ? {
          assignmentId: `assignment-${code}`,
          assignee: {
            id: `user-${code}`,
            name: "QA Contributor",
            email: `${code.replace(".", "-")}@dse.invalid`,
          },
        }
      : null,
    currentSource:
      workflowStatus === "notStarted"
        ? null
        : {
            kind: "current",
            sectionId: `section-${code}`,
            submissionId: null,
            submissionVersion: null,
            content: EMPTY_QA_SAR_DOCUMENT,
            plainText: "Narrative",
            evidenceIds: [],
            capturedAt: "2026-08-26T00:00:00.000Z",
          },
    latestSubmission: null,
    approvedSubmission: null,
    officialPin: null,
    brokenEvidenceReferenceIds: options?.brokenEvidence ?? [],
  };
}

describe("SAR book Part 2 projection", () => {
  test("normalizes requirement workflow states into the five book readiness buckets", () => {
    expect(qaSarBookPart2WorkflowStatus(null)).toBe("notStarted");
    expect(qaSarBookPart2WorkflowStatus("NotStarted")).toBe("notStarted");
    expect(qaSarBookPart2WorkflowStatus("Drafting")).toBe("draft");
    expect(qaSarBookPart2WorkflowStatus("ReadyForReview")).toBe("draft");
    expect(qaSarBookPart2WorkflowStatus("UnderReview")).toBe("submitted");
    expect(qaSarBookPart2WorkflowStatus("ChangesRequested")).toBe("changesRequested");
    expect(qaSarBookPart2WorkflowStatus("Approved")).toBe("approved");
  });

  test("rolls up mixed requirement states without turning readiness into a compliance score", () => {
    const items = [
      requirement("1.1", "notStarted"),
      requirement("1.2", "draft", { assigned: true }),
      requirement("1.3", "submitted", { assigned: true }),
      requirement("1.4", "changesRequested", { brokenEvidence: ["ev-1"] }),
      requirement("1.5", "approved", { assigned: true, brokenEvidence: ["ev-2", "ev-3"] }),
    ];

    expect(summarizeQaSarBookPart2(items)).toEqual({
      total: 5,
      notStarted: 1,
      draft: 1,
      submitted: 1,
      changesRequested: 1,
      approved: 1,
      unassigned: 2,
      brokenEvidenceReferences: 3,
    });
  });
});
