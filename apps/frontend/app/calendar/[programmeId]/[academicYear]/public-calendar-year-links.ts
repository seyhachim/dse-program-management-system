/** Public links reuse the existing published-only academic-calendar pages. */
export const PUBLIC_CALENDAR_STUDY_YEARS = [1, 2, 3, 4] as const;

export type PublicCalendarStudyYear = (typeof PUBLIC_CALENDAR_STUDY_YEARS)[number];

/** Preserve the canonical academic-year label in the URL (e.g. 2026-2027). */
export function publicCalendarYearHref(
  programmeId: string,
  academicYear: string,
  studyYear: PublicCalendarStudyYear,
): string {
  return `/calendar/${encodeURIComponent(programmeId)}/${encodeURIComponent(academicYear)}/year-${studyYear}`;
}
