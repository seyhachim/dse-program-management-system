/** Preserve the persisted AcademicYear.label exactly; public URLs use its hyphenated slug. */
export function parsePublicAcademicYear(segment: string): string {
  return decodeURIComponent(segment);
}

export function parsePublicStudyYear(segment: string): number | null {
  const match = /^year-([1-4])$/i.exec(segment) ?? /^([1-4])$/.exec(segment);
  return match ? Number(match[1]) : null;
}

export function publicAcademicCalendarEndpoint(
  apiUrl: string,
  programmeId: string,
  academicYearLabel: string,
  studyYear: number | null,
): string | null {
  if (studyYear === null || !Number.isInteger(studyYear) || studyYear < 1 || studyYear > 4) {
    return null;
  }
  const query = new URLSearchParams({ studyYear: String(studyYear), academicYear: academicYearLabel });
  return `${apiUrl}/api/programme/public/programmes/${encodeURIComponent(programmeId)}/academic-calendar?${query.toString()}`;
}
