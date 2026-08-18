import { describe, expect, test } from "bun:test";
import type { CourseSpecVersionHistoryItem } from "@dse-pms/shared-types";
import { courseSpecGovernanceActionDecision } from "./course-spec-governance-actions";

const approvedCurrent: CourseSpecVersionHistoryItem = {
  id: "11111111-1111-4111-8111-111111111111",
  courseId: "course-1",
  versionMajor: 1,
  versionMinor: 0,
  academicVersion: "1.0",
  revisionType: "Initial",
  revisionReason: "",
  changeSummary: "",
  basedOnVersionId: null,
  reviewStatus: "Approved",
  submissionVersion: 1,
  approvedAt: "2026-01-01T00:00:00.000Z",
  effectiveFrom: "2026-01-01",
  storedNextReviewDueAt: "2029-01-01",
  effectiveNextReviewDueAt: "2029-01-01",
  latestPeriodicReviewOutcome: null,
  isCurrent: true,
  editable: false,
};

describe("courseSpecGovernanceActionDecision", () => {
  test("allows admin and programme coordinator on current approved version", () => {
    expect(courseSpecGovernanceActionDecision(["admin"], approvedCurrent)).toMatchObject({
      canCreateRevision: true,
      canReaffirm: true,
    });
    expect(courseSpecGovernanceActionDecision(["program_coordinator"], approvedCurrent)).toMatchObject({
      canCreateRevision: true,
      canReaffirm: true,
    });
  });

  test("hides governance actions from lecturers and other non-governance roles", () => {
    expect(courseSpecGovernanceActionDecision(["lecturer"], approvedCurrent)).toEqual({
      isGovernanceUser: false,
      canCreateRevision: false,
      canReaffirm: false,
    });
  });

  test("hides actions when an open revision is current", () => {
    const draftCurrent = { ...approvedCurrent, reviewStatus: "Draft" as const, editable: true };
    expect(courseSpecGovernanceActionDecision(["program_coordinator"], draftCurrent)).toMatchObject({
      canCreateRevision: false,
      canReaffirm: false,
    });
  });

  test("never exposes actions from a historical approved version", () => {
    const historicalApproved = { ...approvedCurrent, isCurrent: false };
    expect(courseSpecGovernanceActionDecision(["admin"], historicalApproved)).toMatchObject({
      canCreateRevision: false,
      canReaffirm: false,
    });
  });
});
