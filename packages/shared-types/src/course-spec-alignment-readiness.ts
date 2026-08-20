export type ConstructiveAlignmentClo = {
  code: string;
  status: "active" | "inactive";
};

export type ConstructiveAlignmentWeek = {
  cloCodes: readonly string[];
};

export type ConstructiveAlignmentAssessment = {
  status: "active" | "inactive";
  cloCodes: readonly string[];
};

export const CONSTRUCTIVE_ALIGNMENT_REQUIRED_ERROR =
  "Course specification is incomplete: Constructive Alignment requires every active CLO to be taught and assessed before submission";

/**
 * Submission readiness for Constructive Alignment is derived only from source-of-truth
 * CLO links in Weekly Plan and active Assessments. Advanced 0–3 mapping strengths are
 * intentionally excluded because they are optional lecturer judgment, not readiness data.
 */
export function isConstructiveAlignmentReady(
  clos: readonly ConstructiveAlignmentClo[],
  weeks: readonly ConstructiveAlignmentWeek[],
  assessments: readonly ConstructiveAlignmentAssessment[],
): boolean {
  const activeClos = clos.filter((clo) => clo.status === "active");
  if (activeClos.length === 0) return false;

  const activeAssessments = assessments.filter(
    (assessment) => assessment.status === "active",
  );

  return activeClos.every((clo) => {
    const taught = weeks.some((week) => week.cloCodes.includes(clo.code));
    const assessed = activeAssessments.some((assessment) =>
      assessment.cloCodes.includes(clo.code),
    );
    return taught && assessed;
  });
}
