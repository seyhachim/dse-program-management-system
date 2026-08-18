import type { WeeklyPlanForm } from "./weekly-plan-model";

const newId = () => globalThis.crypto.randomUUID();

/**
 * Duplicate one Weekly Plan row without reusing any normalized row identity.
 *
 * The duplicate receives the next available week number (max + 1) so persisting
 * it cannot collide with the source week. Nested LLO/activity identities are
 * regenerated as well, and activity -> LLO references are remapped to the new
 * LLO IDs. Academic mappings such as CLOs, teaching methods, resources and
 * assessment methods are preserved.
 */
export function duplicateWeeklyPlanWeek(
  plan: WeeklyPlanForm,
  sourceId: string,
): WeeklyPlanForm {
  const source = plan.find((week) => week.id === sourceId);
  if (!source) return plan;

  const nextWeekNumber =
    plan.reduce((max, week) => Math.max(max, Number(week.week) || 0), 0) + 1;

  const lloIdMap = new Map<string, string>();
  const lessonLearningOutcomes = source.lessonLearningOutcomes.map((llo) => {
    const id = newId();
    lloIdMap.set(llo.id, id);
    return {
      ...llo,
      id,
    };
  });

  const studentLearningActivities = source.studentLearningActivities.map(
    (activity) => ({
      ...activity,
      id: newId(),
      lloIds: activity.lloIds.flatMap((id) => {
        const remapped = lloIdMap.get(id);
        return remapped ? [remapped] : [];
      }),
    }),
  );

  return [
    ...plan,
    {
      ...source,
      id: newId(),
      week: String(nextWeekNumber),
      cloCodes: [...source.cloCodes],
      lloItems: [...source.lloItems],
      lessonLearningOutcomes,
      activities: [...source.activities],
      studentLearningActivities,
      teachingMethodIds: [...source.teachingMethodIds],
      teachingResourceTypes: [...source.teachingResourceTypes],
      assessmentMethodIds: [...source.assessmentMethodIds],
    },
  ];
}
