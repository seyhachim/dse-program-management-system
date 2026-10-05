import type {
  CurriculumVersionSummary,
  ProgrammeCurriculumRevisionTrigger,
  ProgrammeCurriculumRevisionType,
} from "@dse-pms/shared-types";

export type CurriculumRevisionKind = Exclude<
  ProgrammeCurriculumRevisionType,
  "Initial"
>;

export interface CurriculumRevisionDraft {
  revisionType: CurriculumRevisionKind;
  revisionTriggers: ProgrammeCurriculumRevisionTrigger[];
  revisionReason: string;
  changeSummary: string;
}

export function canCreateCurriculumRevision(
  canWrite: boolean,
  status: CurriculumVersionSummary["status"],
): boolean {
  return canWrite && (status === "Approved" || status === "Active");
}

export function nextCurriculumRevisionVersion(
  versions: CurriculumVersionSummary[],
  predecessor: CurriculumVersionSummary,
  revisionType: CurriculumRevisionKind,
): string {
  if (revisionType === "Minor") {
    const latestMinor = Math.max(
      predecessor.versionMinor,
      ...versions
        .filter((version) => version.versionMajor === predecessor.versionMajor)
        .map((version) => version.versionMinor),
    );
    return `${predecessor.versionMajor}.${latestMinor + 1}`;
  }

  const latestMajor = Math.max(
    predecessor.versionMajor,
    ...versions.map((version) => version.versionMajor),
  );
  return `${latestMajor + 1}.0`;
}

export function isCurriculumRevisionReady(
  draft: CurriculumRevisionDraft,
): boolean {
  return (
    draft.revisionTriggers.length > 0 &&
    draft.revisionReason.trim().length > 0 &&
    draft.changeSummary.trim().length > 0
  );
}
