import type { CourseDocumentModel } from "./course-document-model";
import { formatCourseDocumentSltHours } from "./course-document-mapping";

export const REVIEW_MAPPING_NOTE = "Stored CLO allocations are shown once below. PLO cells indicate links only, not PLO-specific hours or mapping strengths. Weekly-only equal-share estimates are provisional and not added to stored allocations.";
export const REVIEW_CREDIT_NOTE = "Credit conversion and mapping-strength policy pending authorized confirmation.";

const hours = (value: number | null) => value == null ? "not specified" : `${formatCourseDocumentSltHours(value)} h`;

/** The same text is used by preview/PDF and Word. No institutional mode is activated. */
export function documentSltReviewLines(document: CourseDocumentModel): string[] {
  const r = document.sltReview;
  if (!r) return [];
  return [
    "SLT review copy — accounting convention not institutionally approved.",
    `Declared: ${hours(r.declared)}; all scheduled sessions: ${hours(r.weeklyTotal)} (instructional ${hours(r.instructionalTotal)}; assessment-only ${hours(r.assessmentOnlyTotal)}).`,
    `Recorded assessment allocations: ${hours(r.assessmentTotal)}${r.missingAssessmentAllocations ? ` (${r.missingAssessmentAllocations} incomplete)` : ""}. Do not add these automatically to the weekly total.`,
    `Alternative candidates: weekly-inclusive ${hours(r.weeklyTotal)}; separate ledger ${hours(r.separateTotal)}${r.missingAssessmentAllocations ? " (incomplete)" : ""}. ${r.inclusiveMatches ? "Inclusive arithmetic matches. " : ""}${r.separateMatches ? "Separate arithmetic matches. " : ""}Matching arithmetic does not prove non-overlap.`,
    `Reconciled candidate: ${document.totals.grandSlt == null ? "unresolved" : hours(document.totals.grandSlt)} (not an approved total). Stored CLO allocations: ${hours(r.cloTotal)}${r.missingCloAllocations ? ` (${r.missingCloAllocations} missing)` : ""}.`,
    ...(r.blocking.length ? [`Resolve: ${r.blocking.join(", ")}.`] : []),
    ...(r.warnings.length ? [`Review: ${r.warnings.join(", ")}.`] : []),
  ];
}
