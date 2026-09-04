import {
  deriveCourseSpecAuthoringReadinessStatus,
  type SpecSectionStatus,
} from "@dse-pms/shared-types";
import type { AssessmentForm } from "./assessment-model";
import type { CloForm } from "./clo-model";
import type { ConstructiveAlignmentAudit } from "./constructive-alignment-model";
import type { WeekForm } from "./weekly-plan-model";

export type OverviewDerivedReadiness = {
  cloReady?: boolean;
  teachingLearningReady?: boolean;
};

/**
 * Overview and the lecturer Course Specifications list share the same authoring
 * readiness semantics. Source-derived CLO, Teaching & Learning, Weekly Plan, and
 * Constructive Alignment readiness override stale persisted completion flags.
 */
export function deriveOverviewReadinessStatus(
  status: Record<string, SpecSectionStatus>,
  clos: CloForm[],
  weeklyPlan: WeekForm[],
  assessments: AssessmentForm[],
  derived: OverviewDerivedReadiness = {},
): Record<string, SpecSectionStatus> {
  return deriveCourseSpecAuthoringReadinessStatus(
    status,
    clos,
    weeklyPlan,
    assessments,
    derived,
  );
}

/**
 * Retained for focused alignment regression tests and callers that already have
 * the richer frontend audit. The canonical full readiness flow above derives the
 * same state through shared source semantics.
 */
export function applyDerivedAlignmentStatus(
  status: Record<string, SpecSectionStatus>,
  audit: ConstructiveAlignmentAudit,
): Record<string, SpecSectionStatus> {
  const effective = { ...status };

  if (audit.allAligned) {
    effective.mapping = "complete";
    return effective;
  }

  if (audit.activeCloCount > 0 || audit.hasWeeklyPlan || audit.hasAssessments) {
    effective.mapping = "draft";
  } else {
    delete effective.mapping;
  }

  return effective;
}
