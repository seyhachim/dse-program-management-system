import type { WeekForm, WeeklyPlanForm } from "./weekly-plan-model";
import { weekSltForm } from "./weekly-plan-model";

export type WeeklyPlanAttentionIssue =
  | "Topic"
  | "CLO"
  | "LLO"
  | "Teaching method"
  | "Learning activity"
  | "Learning time"
  | "Assessment";

function weekLessonOutcomes(week: WeekForm): string[] {
  return week.lessonLearningOutcomes.length > 0
    ? week.lessonLearningOutcomes
        .map((llo) => llo.description)
        .filter(Boolean)
    : week.lloItems.filter(Boolean);
}

function weekActivities(week: WeekForm): string[] {
  return week.studentLearningActivities.length > 0
    ? week.studentLearningActivities
        .map((activity) => activity.title)
        .filter(Boolean)
    : week.activities.filter(Boolean);
}

/**
 * Canonical Weekly Plan attention rules used for Course Specification readiness.
 * Keep these aligned with the Weekly Plan dashboard: a week is ready only when
 * its core planning/alignment fields are present.
 */
export function weeklyPlanWeekAttention(
  week: WeekForm,
): WeeklyPlanAttentionIssue[] {
  const lloCount = weekLessonOutcomes(week).filter((llo) => llo.trim()).length;
  const activityCount = weekActivities(week).filter((activity) => activity.trim()).length;
  const issues: WeeklyPlanAttentionIssue[] = [];

  if (!week.topic.trim()) issues.push("Topic");
  if (week.cloCodes.length === 0) issues.push("CLO");
  if (lloCount === 0) issues.push("LLO");
  if (week.teachingMethodIds.length === 0) issues.push("Teaching method");
  if (activityCount === 0) issues.push("Learning activity");
  if (weekSltForm(week) <= 0) issues.push("Learning time");
  if (week.assessmentMethodIds.length === 0 && !week.assessment.trim()) {
    issues.push("Assessment");
  }

  return issues;
}

export function weeklyPlanIsReady(plan: WeeklyPlanForm): boolean {
  return (
    plan.length > 0 &&
    plan.every((week) => weeklyPlanWeekAttention(week).length === 0)
  );
}
