import {
  courseSpecWeeklyPlanWeekAttention,
  isCourseSpecWeeklyPlanReady,
  type CourseSpecWeeklyPlanAttentionIssue,
} from "@dse-pms/shared-types";
import type { WeekForm, WeeklyPlanForm } from "./weekly-plan-model";

export type WeeklyPlanAttentionIssue = CourseSpecWeeklyPlanAttentionIssue;

/**
 * Canonical Weekly Plan attention rules shared with CourseSpec progress/readiness.
 */
export function weeklyPlanWeekAttention(
  week: WeekForm,
): WeeklyPlanAttentionIssue[] {
  return courseSpecWeeklyPlanWeekAttention(week);
}

export function weeklyPlanIsReady(plan: WeeklyPlanForm): boolean {
  return isCourseSpecWeeklyPlanReady(plan);
}
