import type { CurriculumVersionSummary } from "@dse-pms/shared-types";

export const CURRICULUM_WORKSPACE_TABS = [
  "study-plan",
  "structure-mapping",
  "versions-revisions",
  "import-export",
] as const;

export type CurriculumWorkspaceTab = (typeof CURRICULUM_WORKSPACE_TABS)[number];
export type StudyYear = 1 | 2 | 3 | 4;

type VersionPreferenceCandidate = Pick<
  CurriculumVersionSummary,
  "id" | "version" | "status"
>;

const VERSION_STATUS_PRIORITY: Record<CurriculumVersionSummary["status"], number> = {
  Active: 4,
  Approved: 3,
  Draft: 2,
  Superseded: 1,
};

export function pickPreferredCurriculumVersion<T extends VersionPreferenceCandidate>(
  versions: T[],
): T | null {
  if (versions.length === 0) return null;

  return [...versions].sort((left, right) => {
    const statusDifference =
      VERSION_STATUS_PRIORITY[right.status] - VERSION_STATUS_PRIORITY[left.status];
    if (statusDifference !== 0) return statusDifference;

    return Number(right.version) - Number(left.version);
  })[0] ?? null;
}

export function normalizeStudyYear(value: unknown): StudyYear {
  const numeric = Number(value);
  return numeric === 2 || numeric === 3 || numeric === 4 ? numeric : 1;
}

export function studyYearSessionKey(curriculumId: string): string {
  return `dse-pms:curriculum:study-year:${curriculumId}`;
}
