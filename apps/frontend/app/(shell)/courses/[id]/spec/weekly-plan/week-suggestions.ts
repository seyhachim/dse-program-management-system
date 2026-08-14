import type { ActiveLearningCluster, Method } from "@dse-pms/shared-types";
import type { TeachingLearningProfile } from "@/lib/teaching-learning";
import type { CloForm } from "../clo-model";
import type { AssessmentForm } from "../assessment-model";

export type WeekSuggestions = {
  teachingMethods: Method[];
  activeLearningStrategies: { id: string; label: string }[];
  resourceTypes: string[];
  technologyTypes: string[];
  independentLearningTypes: string[];
  assessments: AssessmentForm[];
};

export function buildWeekSuggestions({
  week,
  cloCodes,
  clos,
  teachingMethods,
  activeLearningClusters,
  profile,
  assessments,
}: {
  week: string;
  cloCodes: string[];
  clos: CloForm[];
  teachingMethods: Method[];
  activeLearningClusters: ActiveLearningCluster[];
  profile: TeachingLearningProfile | null;
  assessments: AssessmentForm[];
}): WeekSuggestions {
  const linkedClos = clos.filter((clo) => cloCodes.includes(clo.code));
  const cloMethodIds = new Set(linkedClos.flatMap((clo) => clo.teachingMethodIds));
  const courseMethodIds = new Set(profile?.teachingMethodIds ?? []);
  const preferredMethodIds = new Set(
    [...cloMethodIds].filter(
      (id) => courseMethodIds.size === 0 || courseMethodIds.has(id),
    ),
  );

  const teachingMethodSuggestions = teachingMethods.filter((method) =>
    preferredMethodIds.has(method.id),
  );

  const strategyById = new Map(
    activeLearningClusters
      .flatMap((cluster) => cluster.strategies)
      .map((strategy) => [strategy.id, strategy] as const),
  );
  const cloStrategyIds = new Set(
    linkedClos.flatMap((clo) => clo.activeLearningStrategyIds),
  );
  const courseStrategyIds = new Set(
    profile?.activeLearningStrategyIds ?? [],
  );
  const preferredStrategyIds =
    cloStrategyIds.size > 0
      ? [...cloStrategyIds].filter(
          (id) => courseStrategyIds.size === 0 || courseStrategyIds.has(id),
        )
      : [...courseStrategyIds];

  const activeLearningStrategies = preferredStrategyIds
    .map((id) => strategyById.get(id))
    .filter((strategy) => Boolean(strategy))
    .map((strategy) => ({ id: strategy!.id, label: strategy!.name }));

  const weekNumber = Number(week);
  const assessmentSuggestions = assessments.filter((assessment) => {
    if (assessment.status !== "active") return false;
    if (!assessment.dueWeek || Number(assessment.dueWeek) !== weekNumber) {
      return false;
    }
    if (
      assessment.cloCodes.length > 0 &&
      !assessment.cloCodes.some((code) => cloCodes.includes(code))
    ) {
      return false;
    }
    return true;
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
