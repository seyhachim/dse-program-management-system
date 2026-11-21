/**
 * A public section announcement about availability only: never include marks,
 * student identifiers, grades, feedback, or result/provenance IDs.
 */
export function scoreReleaseNotice(courseCode: string, sectionCode: string, assessmentName: string) {
  const shortCode = courseCode.trim().slice(0, 20);
  const shortName = assessmentName.trim().slice(0, 100);
  return {
    title: `${shortCode} · ${shortName} results available`,
    body: `Results for ${courseCode} (Section ${sectionCode}) — ${assessmentName} have been published in DSE PMS. Sign in to your student portal to review your own score and feedback. Depending on course settings, you may need to complete the final course survey before viewing provisional results. Please contact your lecturer privately with any questions.`,
    pinned: false as const,
  };
}

export function hasScoreReleaseNotice(
  announcements: Array<{ title: string; publishedAt: string | null }>,
  expectedTitle: string,
): boolean {
  return announcements.some((notice) => notice.publishedAt !== null && notice.title === expectedTitle);
}
