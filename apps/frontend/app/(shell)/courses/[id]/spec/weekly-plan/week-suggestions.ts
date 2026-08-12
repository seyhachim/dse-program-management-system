import type { Method } from "@dse-pms/shared-types";
import type { TeachingLearningProfile } from "@/lib/teaching-learning";
import type { CloForm } from "../clo-model";
import type { AssessmentForm } from "../assessment-model";
import { ACTIVE_LEARNING_CLUSTERS } from "../teaching-learning/strategy-catalog";

export type WeekSuggestions = {
  teachingMethods: Method[];
  activeLearningStrategies: { id: string; label: string }[];
  resourceTypes: string[];
  technologyTypes: string[];
  independentLearningTypes: string[];
  assessments: AssessmentForm[];
};

const strategyById = new Map(
  ACTIVE_LEARNING_CLUSTERS.flatMap((cluster) => cluster.strategies).map((strategy) => [
    strategy.id,
    strategy,
  ]),
);

export function buildWeekSuggestions({
  week,
  cloCodes,
  clos,
  teachingMethods,
  profile,
  assessments,
}: {
  week: string;
  cloCodes: string[];
  clos: CloForm[];
  teachingMethods: Method[];
  profile: TeachingLearningProfile | null;
  assessments: AssessmentForm[];
}): WeekSuggestions {
  const linkedClos = clos.filter((clo) => cloCodes.includes(clo.code));
  const cloMethodIds = new Set(linkedClos.flatMap((clo) => clo.teachingMethodIds));
  const courseMethodIds = new Set(profile?.teachingMethodIds ?? []);
  const preferredMethodIds = new Set(
    [...cloMethodIds].filter((id) => courseMethodIds.size === 0 || courseMethodIds.has(id)),
  );

  const teachingMethodSuggestions = teachingMethods.filter((method) =>
    preferredMethodIds.has(method.id),
  );

  const activeLearningStrategies = (profile?.activeLearningStrategyIds ?? [])
    .map((id) => strategyById.get(id))
    .filter((strategy): strategy is { id: string; label: string } => Boolean(strategy));

  const weekNumber = Number(week);
  const assessmentSuggestions = assessments.filter((assessment) => {
    if (assessment.status !== "active") return false;
    if (assessment.cloCodes.length > 0 && !assessment.cloCodes.some((code) => cloCodes.includes(code))) {
      return false;
    }
    if (!assessment.dueWeek) return true;
    return Number(assessment.dueWeek) === weekNumber;
  });

  return {
    teachingMethods: teachingMethodSuggestions,
    activeLearningStrategies,
    resourceTypes: profile?.resourceTypes ?? [],
    technologyTypes: profile?.technologyTypes ?? [],
    independentLearningTypes: profile?.independentLearningTypes ?? [],
    assessments: assessmentSuggestions,
  };
}

export const WEEK_RESOURCE_TYPE_MAP: Record<string, string> = {
  Slides: "LECTURE_SLIDES",
  Readings: "TEXTBOOK",
  Datasets: "DATASET",
  Worksheets: "LAB_MATERIAL",
  Videos: "VIDEO",
  "Case Studies": "OTHER",
};
