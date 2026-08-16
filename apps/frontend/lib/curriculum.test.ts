import { describe, expect, test } from "bun:test";
import type { CurriculumVersionSummary } from "@dse-pms/shared-types";
import {
  curriculumStatusLabel,
  curriculumVersionLabel,
  revisionTriggerLabel,
} from "./curriculum.ts";

function version(
  overrides: Partial<CurriculumVersionSummary> = {},
): CurriculumVersionSummary {
  return {
    id: "0c85ef3b-b579-4aef-82fb-739bf1930f54",
    versionMajor: 1,
    versionMinor: 0,
    version: "1.0",
    status: "Draft",
    revisionType: "Initial",
    revisionTriggers: [],
    revisionReason: "",
    changeSummary: "",
    basedOnVersionId: null,
    cohortLabel: "2026 intake",
    intakeYear: 2026,
    academicYear: "2026-2027",
    effectiveFrom: null,
    approvedAt: null,
    createdById: "604c758f-f48f-421a-a6be-1182c9c551e5",
    createdAt: "2026-08-16T00:00:00.000Z",
    updatedAt: "2026-08-16T00:00:00.000Z",
    ...overrides,
  };
}

describe("curriculum viewer helpers", () => {
  test("formats semantic version labels", () => {
    expect(curriculumVersionLabel(version({ version: "1.10" }))).toBe("v1.10");
  });

  test("keeps lifecycle labels explicit", () => {
    expect(curriculumStatusLabel("Approved")).toBe("Approved");
    expect(curriculumStatusLabel("Superseded")).toBe("Superseded");
  });

  test("renders revision triggers as readable labels", () => {
    expect(revisionTriggerLabel("EmployerFeedback")).toBe("Employer Feedback");
    expect(revisionTriggerLabel("QaFinding")).toBe("Qa Finding");
  });
});
