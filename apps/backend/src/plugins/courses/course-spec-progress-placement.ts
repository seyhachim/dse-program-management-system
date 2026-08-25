export interface ActiveCurriculumPlacementCandidate {
  yearLevel: number;
  semester: "First" | "Second";
  sortOrder: number;
}

/**
 * A dashboard without an explicit curriculum selector must never guess between
 * multiple active curriculum roots. Ambiguous placement is surfaced as null so
 * the course remains visible in the Unassigned / other group.
 */
export function uniqueActiveCurriculumPlacement<T extends ActiveCurriculumPlacementCandidate>(
  placements: readonly T[],
): T | null {
  return placements.length === 1 ? placements[0] ?? null : null;
}
