function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Course Specification renderers add the canonical `Topic N:` label themselves.
 * Legacy/imported Weekly Plan data can already contain that exact prefix, so
 * strip only the matching week prefix before rendering to avoid duplicates.
 *
 * This is presentation-only normalization: the stored Weekly Plan topic is not
 * rewritten or mutated.
 */
export function normalizeCourseDocumentTopic(
  week: string,
  topic: string,
): string {
  const trimmedTopic = topic.trim();
  const trimmedWeek = week.trim();

  if (!trimmedTopic || !trimmedWeek) return trimmedTopic;

  const matchingPrefix = new RegExp(
    `^Topic\\s+${escapeRegExp(trimmedWeek)}\\s*:\\s*`,
    "i",
  );

  return trimmedTopic.replace(matchingPrefix, "").trim();
}
