import type { SpecSectionStatus } from "@dse-pms/shared-types";
import type { AssessmentForm } from "./assessment-model";
import type { CloForm } from "./clo-model";
import {
  deriveConstructiveAlignmentAudit,
  type ConstructiveAlignmentAudit,
} from "./constructive-alignment-model";
import type { WeekForm } from "./weekly-plan-model";

/**
 * Overview readiness must reflect source-data semantics used by the actual
 * submission workflow. Constructive Alignment is derived from CLO coverage, and
 * Specification Date is system-assigned on first submission rather than lecturer
 * work, so neither should be driven by a stale/manual section flag here.
 */
export function deriveOverviewReadinessStatus(
  status: Record<string, SpecSectionStatus>,
  clos: CloForm[],
  weeklyPlan: WeekForm[],
  assessments: AssessmentForm[],
): Record<string, SpecSectionStatus> {
  const effective = applyDerivedAlignmentStatus(
    status,
    deriveConstructiveAlignmentAudit(clos, weeklyPlan, assessments),
  );
  effective.date = "complete";
  return effective;
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
