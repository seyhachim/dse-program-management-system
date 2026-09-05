import type { CourseSpecVersionRef } from "@dse-pms/shared-types";

export type OfferingTeamSuggestion = {
  primaryLecturerId: string | null;
  coLecturerIds: string[];
  responsibilityMode: "LEAD_AND_CO" | "SHARED";
  requiresPrimarySelection: boolean;
};

/**
 * Convert one exact Approved CourseSpec's academic Course Team into an initial
 * delivery-team suggestion. Existing offerings deliberately opt out: their saved
 * term/section assignments are historical delivery evidence and must never be
 * overwritten by later CourseSpec reads.
 */
export function offeringTeamSuggestion(
  spec: CourseSpecVersionRef | null | undefined,
  editing: boolean,
): OfferingTeamSuggestion | null {
  if (editing || !spec?.courseTeam) return null;

  const { courseTeam } = spec;
  if (courseTeam.responsibilityMode === "LEAD_AND_CO") {
    const primaryLecturerId = courseTeam.leadLecturerId;
    return {
      primaryLecturerId,
      coLecturerIds: courseTeam.lecturers
        .filter((lecturer) => lecturer.id !== primaryLecturerId)
        .map((lecturer) => lecturer.id),
      responsibilityMode: "LEAD_AND_CO",
      requiresPrimarySelection: !primaryLecturerId,
    };
  }

  return {
    primaryLecturerId: null,
    coLecturerIds: courseTeam.lecturers.map((lecturer) => lecturer.id),
    responsibilityMode: "SHARED",
    requiresPrimarySelection: true,
  };
}

export function removePrimaryFromCoLecturers(
  primaryLecturerId: string | null,
  coLecturerIds: readonly string[],
): string[] {
  if (!primaryLecturerId) return [...coLecturerIds];
  return coLecturerIds.filter((lecturerId) => lecturerId !== primaryLecturerId);
}
