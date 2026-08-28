export type CourseDocumentWeekForMapping = {
  cloCodes: string[];
  sltHours: string;
};

/**
 * Derive the SLT represented by Weekly Plan rows linked to one CLO.
 *
 * Weekly Plan is the authoritative source for delivered course-content SLT in
 * the document preview/export. Older Course Specs can still carry a CLO-level
 * SLT snapshot, so preserve that as a fallback when no linked week contributes
 * a positive numeric SLT value.
 *
 * This helper is read-only: it never rewrites CLO or Weekly Plan source data.
 */
export function courseDocumentCloSltHours(
  cloCode: string,
  weeks: readonly CourseDocumentWeekForMapping[],
  fallbackSltHours = "",
): string {
  const linkedSlt = weeks
    .filter((week) => week.cloCodes.includes(cloCode))
    .reduce((sum, week) => {
      const value = Number(week.sltHours);
      return sum + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);

  return linkedSlt > 0 ? String(linkedSlt) : fallbackSltHours;
}
