import { describe, expect, test } from "bun:test";
import type { CourseSpecVersionRef } from "@dse-pms/shared-types";
import {
  offeringTeamSuggestion,
  removePrimaryFromCoLecturers,
} from "./offering-team-suggestion";

function spec(
  responsibilityMode: "LEAD_AND_CO" | "SHARED",
  leadLecturerId: string | null,
  ids: string[],
): CourseSpecVersionRef {
  return {
    id: "00000000-0000-4000-8000-000000000100",
    courseId: "00000000-0000-4000-8000-000000000200",
    versionMajor: 1,
    versionMinor: 0,
    version: "1.0",
    reviewStatus: "Approved",
    approvedAt: "2026-09-05T00:00:00.000Z",
    effectiveFrom: null,
    courseTeam: {
      responsibilityMode,
      leadLecturerId,
      lecturers: ids.map((id, index) => ({
        id,
        name: `Lecturer ${index + 1}`,
        email: `lecturer${index + 1}@example.edu`,
        role:
          responsibilityMode === "SHARED"
            ? "SHARED"
            : id === leadLecturerId
              ? "RESPONSIBLE"
              : "CO_LECTURER",
      })),
    },
  };
}

describe("offeringTeamSuggestion", () => {
  test("maps Responsible Lecturer to primary and remaining members to co-lecturers", () => {
    const result = offeringTeamSuggestion(
      spec("LEAD_AND_CO", "lead", ["lead", "co-a", "co-b"]),
      false,
    );

    expect(result).toEqual({
      primaryLecturerId: "lead",
      coLecturerIds: ["co-a", "co-b"],
      responsibilityMode: "LEAD_AND_CO",
      requiresPrimarySelection: false,
    });
  });

  test("keeps shared responsibility leadless until Admin chooses delivery primary", () => {
    const result = offeringTeamSuggestion(
      spec("SHARED", null, ["shared-a", "shared-b"]),
      false,
    );

    expect(result).toEqual({
      primaryLecturerId: null,
      coLecturerIds: ["shared-a", "shared-b"],
      responsibilityMode: "SHARED",
      requiresPrimarySelection: true,
    });
  });

  test("returns the selected version's own team when CourseSpec selection changes", () => {
    const first = offeringTeamSuggestion(
      spec("LEAD_AND_CO", "lead-v1", ["lead-v1", "co-v1"]),
      false,
    );
    const second = offeringTeamSuggestion(
      spec("LEAD_AND_CO", "lead-v2", ["lead-v2", "co-v2"]),
      false,
    );

    expect(first?.primaryLecturerId).toBe("lead-v1");
    expect(first?.coLecturerIds).toEqual(["co-v1"]);
    expect(second?.primaryLecturerId).toBe("lead-v2");
    expect(second?.coLecturerIds).toEqual(["co-v2"]);
  });

  test("never suggests over an existing Offering", () => {
    expect(
      offeringTeamSuggestion(
        spec("LEAD_AND_CO", "lead", ["lead", "co"]),
        true,
      ),
    ).toBeNull();
  });
});

describe("removePrimaryFromCoLecturers", () => {
  test("removes an Admin-selected primary from a shared-team co-lecturer suggestion", () => {
    expect(
      removePrimaryFromCoLecturers("shared-b", ["shared-a", "shared-b", "shared-c"]),
    ).toEqual(["shared-a", "shared-c"]);
  });
});
