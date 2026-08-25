export type ImportedAssessmentWeight = {
  weight: number | null;
};

/**
 * Imported assessment plans are complete only when there is at least one
 * assessment and every assessment has an explicit weight. A literal 0 is a
 * supplied value and must not be treated as missing.
 */
export function isImportedAssessmentPlanComplete(
  assessmentRows: ImportedAssessmentWeight[],
): boolean {
  return assessmentRows.length > 0 && assessmentRows.every((row) => row.weight !== null);
}

/**
 * Some incomplete sections must still be materialized as Draft rows so the
 * lecturer sees that review is required after import.
 */
export function shouldPersistImportedSection(
  sectionKey: string,
  complete: boolean,
): boolean {
  return complete || sectionKey === "teachingLearning" || sectionKey === "assessmentPlan";
}
