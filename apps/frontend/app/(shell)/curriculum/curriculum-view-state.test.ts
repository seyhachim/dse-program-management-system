import { describe, expect, test } from "bun:test";
import type { CurriculumVersionSummary } from "@dse-pms/shared-types";
import {
  CURRICULUM_WORKSPACE_TABS,
  normalizeStudyYear,
  pickPreferredCurriculumVersion,
  studyYearSessionKey,
} from "./curriculum-view-state";

function version(
  id: string,
  value: number,
  status: CurriculumVersionSummary["status"],
): CurriculumVersionSummary {
  return {
    id,
    version: value,
    status,
    revisionType: "Minor",
    revisionReason: null,
    changeSummary: null,
    cohortLabel: null,
    academicYear: null,
    revisionTriggers: [],
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  } as CurriculumVersionSummary;
}

describe("curriculum view state", () => {
  test("exposes exactly the four agreed workspace tabs", () => {
    expect(CURRICULUM_WORKSPACE_TABS).toEqual([
      "study-plan",
      "structure-mapping",
      "versions-revisions",
      "import-export",
    ]);
  });

  test("prefers the active official version over a numerically newer draft", () => {
    const selected = pickPreferredCurriculumVersion([
      version("draft", 3, "Draft"),
      version("active", 2, "Active"),
    ]);

    expect(selected?.id).toBe("active");
  });

  test("falls back from Active to Approved, Draft, then Superseded", () => {
    expect(
      pickPreferredCurriculumVersion([
        version("old", 4, "Superseded"),
        version("draft", 3, "Draft"),
        version("approved", 2, "Approved"),
      ])?.id,
    ).toBe("approved");

    expect(
      pickPreferredCurriculumVersion([
        version("old", 4, "Superseded"),
        version("draft", 3, "Draft"),
      ])?.id,
    ).toBe("draft");
  });

  test("uses the newest version inside the same status", () => {
    expect(
      pickPreferredCurriculumVersion([
        version("v1", 1, "Active"),
        version("v2", 2, "Active"),
      ])?.id,
    ).toBe("v2");
  });

  test("normalizes unknown study year values to Year 1", () => {
    expect(normalizeStudyYear("4")).toBe(4);
    expect(normalizeStudyYear("2")).toBe(2);
    expect(normalizeStudyYear("9")).toBe(1);
    expect(normalizeStudyYear(null)).toBe(1);
  });

  test("scopes remembered year to a curriculum", () => {
    expect(studyYearSessionKey("curriculum-1")).toBe(
      "dse-pms:curriculum:study-year:curriculum-1",
    );
  });
});
