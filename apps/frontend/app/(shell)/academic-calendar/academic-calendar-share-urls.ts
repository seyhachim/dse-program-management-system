/** Build public calendar links from their canonical path, never from a share URL's query string. */
export function publicCalendarSharePath(
  programmeId: string,
  academicYear: string,
  studyYear?: number,
): string {
  // Keep the existing handbook/public-link slug convention for saved AcademicYear labels.
  const slug = academicYear.replace(/–/g, "-").replace(/\s+/g, "");
  const hub = `/calendar/${encodeURIComponent(programmeId)}/${encodeURIComponent(slug)}`;
  return studyYear === undefined ? hub : `${hub}/year-${studyYear}`;
}

export function publicCalendarShareUrl(
  origin: string,
  programmeId: string,
  academicYear: string,
  studyYear?: number,
): string {
  return new URL(publicCalendarSharePath(programmeId, academicYear, studyYear), origin).toString();
}
