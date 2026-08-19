export function canManageOfferingResults(
  authorId: string,
  programmeWide: boolean,
  lecturerId: string | null,
  coLecturerIds: string[],
): boolean {
  return programmeWide || lecturerId === authorId || coLecturerIds.includes(authorId);
}
