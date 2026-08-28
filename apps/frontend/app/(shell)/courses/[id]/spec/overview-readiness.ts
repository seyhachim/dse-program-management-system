import type { SpecSectionStatus } from "@dse-pms/shared-types";
import type { AssessmentForm } from "./assessment-model";
import type { CloForm } from "./clo-model";
import {
  deriveConstructiveAlignmentAudit,
  type ConstructiveAlignmentAudit,
} from "./constructive-alignment-model";
import type { WeekForm } from "./weekly-plan-model";
import { weeklyPlanIsReady } from "./weekly-plan-readiness";

export type OverviewDerivedReadiness = {
  cloReady?: boolean;
  teachingLearningReady?: boolean;
};

/**
 * Overview readiness must reflect source-data semantics used by the actual
 * authoring workflow. Constructive Alignment, CLO validity, Teaching & Learning,
 * and Weekly Plan readiness are derived from current source data rather than
 * stale persisted completion flags. Specification Date is system-assigned on
 * first submission and is therefore not lecturer work.
 */
export function deriveOverviewReadinessStatus(
  status: Record<string, SpecSectionStatus>,
  clos: CloForm[],
  weeklyPlan: WeekForm[],
  assessments: AssessmentForm[],
  derived: OverviewDerivedReadiness = {},
): Record<string, SpecSectionStatus> {
  const effective = applyDerivedAlignmentStatus(
    status,
    deriveConstructiveAlignmentAudit(clos, weeklyPlan, assessments),
  );

  if (derived.cloReady !== undefined) {
    effective.clos = derived.cloReady ? "complete" : "draft";
  }
  if (derived.teachingLearningReady !== undefined) {
    effective.teachingLearning = derived.teachingLearningReady
      ? "complete"
      : "draft";
  }

  effective.slt = weeklyPlanIsReady(weeklyPlan) ? "complete" : "draft";

  // Kept complete for compatibility with other completion consumers. Overview's
  // lecturer-work list excludes Date and includes Teaching & Learning instead.
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
