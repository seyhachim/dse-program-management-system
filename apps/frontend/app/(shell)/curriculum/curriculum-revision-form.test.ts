import { describe, expect, test } from "bun:test";
import type { CurriculumVersionSummary } from "@dse-pms/shared-types";
import {
  canCreateCurriculumRevision,
  isCurriculumRevisionReady,
  nextCurriculumRevisionVersion,
} from "./curriculum-revision-form";

function version(
  id: string,
  major: number,
  minor: number,
  status: CurriculumVersionSummary["status"],
): CurriculumVersionSummary {
  return {
    id,
    versionMajor: major,
    versionMinor: minor,
    version: `${major}.${minor}`,
    status,
    revisionType: major === 1 && minor === 0 ? "Initial" : "Minor",
    revisionTriggers: [],
    revisionReason: "",
    changeSummary: "",
    basedOnVersionId: null,
    cohortLabel: "Cohort 2026",
    intakeYear: 2026,
    academicYear: "2026-2027",
    effectiveFrom: null,
    approvedAt: status === "Approved" || status === "Active" ? "2026-09-01T00:00:00.000Z" : null,
    createdById: "00000000-0000-0000-0000-000000000001",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("curriculum revision form", () => {
  test("only programme writers can create revisions from Approved or Active versions", () => {
    expect(canCreateCurriculumRevision(true, "Approved")).toBe(true);
    expect(canCreateCurriculumRevision(true, "Active")).toBe(true);
    expect(canCreateCurriculumRevision(true, "Draft")).toBe(false);
    expect(canCreateCurriculumRevision(true, "Superseded")).toBe(false);
    expect(canCreateCurriculumRevision(false, "Approved")).toBe(false);
  });

  test("previews the same next version numbering used by the backend", () => {
    const predecessor = version("approved", 2, 0, "Approved");
    const versions = [
      predecessor,
      version("other-minor", 2, 2, "Superseded"),
      version("older-major", 1, 4, "Superseded"),
    ];

    expect(nextCurriculumRevisionVersion(versions, predecessor, "Minor")).toBe("2.3");
    expect(nextCurriculumRevisionVersion(versions, predecessor, "Major")).toBe("3.0");
  });

  test("requires a trigger, reason, and change summary", () => {
    expect(
      isCurriculumRevisionReady({
        revisionType: "Minor",
        revisionTriggers: [],
        revisionReason: "Add competency context",
        changeSummary: "Create a new auditable draft",
      }),
    ).toBe(false);

    expect(
      isCurriculumRevisionReady({
        revisionType: "Minor",
        revisionTriggers: ["ProgrammeCoordinator"],
        revisionReason: "   ",
        changeSummary: "Create a new auditable draft",
      }),
    ).toBe(false);

    expect(
      isCurriculumRevisionReady({
        revisionType: "Minor",
        revisionTriggers: ["ProgrammeCoordinator"],
        revisionReason: "Add competency context",
        changeSummary: "Create a new auditable draft",
      }),
    ).toBe(true);
  });
});
