export const PROGRAMME_CURRICULUM_STATUSES = [
  "Draft",
  "Approved",
  "Active",
  "Superseded",
] as const;

export type ProgrammeCurriculumStatus =
  (typeof PROGRAMME_CURRICULUM_STATUSES)[number];

export const IMMUTABLE_PROGRAMME_CURRICULUM_STATUSES = new Set<ProgrammeCurriculumStatus>([
  "Approved",
  "Active",
  "Superseded",
]);

export type ProgrammeCurriculumRevisionType = "Initial" | "Minor" | "Major";

export type ProgrammeCurriculumRevisionMetadata = {
  revisionType: ProgrammeCurriculumRevisionType;
  revisionReason: string;
  changeSummary: string;
};

export function assertProgrammeCurriculumMutable(
  status: ProgrammeCurriculumStatus,
): void {
  if (IMMUTABLE_PROGRAMME_CURRICULUM_STATUSES.has(status)) {
    throw new Error(`Curriculum version is immutable while status is ${status}`);
  }
}

export function assertProgrammeCurriculumYearLevel(yearLevel: number): void {
  if (!Number.isInteger(yearLevel) || yearLevel < 1 || yearLevel > 4) {
    throw new Error("Curriculum year level must be an integer between 1 and 4");
  }
}

export function assertProgrammeCurriculumRevisionMetadata(
  metadata: ProgrammeCurriculumRevisionMetadata,
): void {
  if (metadata.revisionType === "Initial") return;

  if (metadata.revisionReason.trim().length === 0) {
    throw new Error("Curriculum revision reason is required for non-initial revisions");
  }

  if (metadata.changeSummary.trim().length === 0) {
    throw new Error("Curriculum change summary is required for non-initial revisions");
  }
}

export function formatProgrammeCurriculumVersion(
  versionMajor: number,
  versionMinor: number,
): string {
  if (!Number.isInteger(versionMajor) || versionMajor < 1) {
    throw new Error("Curriculum major version must be an integer of at least 1");
  }
  if (!Number.isInteger(versionMinor) || versionMinor < 0) {
    throw new Error("Curriculum minor version must be a non-negative integer");
  }
  return `${versionMajor}.${versionMinor}`;
}
