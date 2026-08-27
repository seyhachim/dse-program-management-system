import type { SpecSectionStatus } from "@dse-pms/shared-types";
import type { AssessmentForm } from "./assessment-model";
import type { CloForm } from "./clo-model";
import {
  deriveConstructiveAlignmentAudit,
  type ConstructiveAlignmentAudit,
} from "./constructive-alignment-model";
import type { WeekForm } from "./weekly-plan-model";

/**
 * Overview readiness must reflect the same source-data semantics used by the
 * Constructive Alignment audit and Review & Submit guard. The persisted
 * `mapping` section status only records whether the optional advanced matrix
 * has been saved; it is not authoritative for alignment readiness.
 */
export function deriveOverviewReadinessStatus(
  status: Record<string, SpecSectionStatus>,
  clos: CloForm[],
  weeklyPlan: WeekForm[],
  assessments: AssessmentForm[],
): Record<string, SpecSectionStatus> {
  return applyDerivedAlignmentStatus(
    status,
    deriveConstructiveAlignmentAudit(clos, weeklyPlan, assessments),
  );
}

export function applyDerivedAlignmentStatus(
  status: Record<string, SpecSectionStatus>,
  audit: ConstructiveAlignmentAudit,
): Record<string, SpecSectionStatus> {
  const effective = { ...status };

  if (audit.allAligned) {
    effective.mapping = "complete";
    return effective;
  }

  // If there is source material to review, alignment is genuinely in progress.
  // Otherwise remove a stale persisted "complete" flag so Overview presents it
  // as not started rather than contradicting the current source data.
  if (audit.activeCloCount > 0 || audit.hasWeeklyPlan || audit.hasAssessments) {
    effective.mapping = "draft";
  } else {
    delete effective.mapping;
  }

  return effective;
}
