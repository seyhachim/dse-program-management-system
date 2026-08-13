"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Check, Lightbulb, Loader2, Plus } from "lucide-react";
import type { Method, StudentLearningActivity } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { courseSpecApi } from "@/lib/course-spec";
import {
  EMPTY_TEACHING_LEARNING_PROFILE,
  teachingLearningApi,
  type TeachingLearningProfile,
} from "@/lib/teaching-learning";
import type { CloForm } from "../clo-model";
import { toAssessmentForm, type AssessmentForm } from "../assessment-model";
import type { WeekForm } from "../weekly-plan-model";
import {
  buildWeekSuggestions,
  WEEK_RESOURCE_TYPE_MAP,
  type WeekSuggestions,
} from "./week-suggestions";

export function WeekSuggestionsPanel({
  courseId,
  draft,
  set,
  clos,
  teachingMethods,
}: {
  courseId: string;
  draft: WeekForm;
  set: (patch: Partial<WeekForm>) => void;
  clos: CloForm[];
  teachingMethods: Method[];
}) {
  const [profile, setProfile] = useState<TeachingLearningProfile | null>(null);
  const [assessments, setAssessments] = useState<AssessmentForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      teachingLearningApi
        .get(courseId)
        .catch(() => EMPTY_TEACHING_LEARNING_PROFILE),
      courseSpecApi.get(courseId),
    ])
      .then(([teachingLearning, spec]) => {
        if (cancelled) return;
        setProfile(teachingLearning);
        setAssessments(toAssessmentForm(spec.data.assessmentPlan));
      })
      .catch(() => {
        if (!cancelled) setError("Course suggestions could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const suggestions = useMemo(
    () =>
      buildWeekSuggestions({
        week: draft.week,
        cloCodes: draft.cloCodes,
        clos,
        teachingMethods,
        profile,
        assessments,
      }),
    [draft.week, draft.cloCodes, clos, teachingMethods, profile, assessments],
  );

  const suggestionCount = countSuggestions(suggestions);

  const addTeachingMethod = (id: string) => {
    if (draft.teachingMethodIds.includes(id)) return;
    set({ teachingMethodIds: [...draft.teachingMethodIds, id] });
  };

  const addActivity = (title: string) => {
    if (hasActivity(draft, title)) return;
    set({
      studentLearningActivities: [
        ...draft.studentLearningActivities,
        makeSuggestedActivity(title),
      ],
    });
  };

  const addResource = (resourceType: string) => {
    const mapped = WEEK_RESOURCE_TYPE_MAP[resourceType];
    if (!mapped || draft.teachingResourceTypes.includes(mapped)) return;
    set({ teachingResourceTypes: [...draft.teachingResourceTypes, mapped] });
  };

  const addTechnology = (technology: string) => {
    const mapped = technologyResourceType(technology);
    if (!draft.teachingResourceTypes.includes(mapped)) {
      set({ teachingResourceTypes: [...draft.teachingResourceTypes, mapped] });
    }
  };

  const addAssessment = (assessment: AssessmentForm) => {
    set({ assessment: assessment.name });
  };

  const useAll = () => {
    const teachingMethodIds = [
      ...new Set([
        ...draft.teachingMethodIds,
        ...suggestions.teachingMethods.map((method) => method.id),
      ]),
    ];

    const suggestedActivityTitles = [
      ...suggestions.activeLearningStrategies.map((strategy) => strategy.label),
      ...suggestions.independentLearningTypes,
    ];
    const newActivities = suggestedActivityTitles
      .filter((title) => !hasActivity(draft, title))
      .map(makeSuggestedActivity);

    const mappedResourceTypes = suggestions.resourceTypes
      .map((type) => WEEK_RESOURCE_TYPE_MAP[type])
      .filter((value): value is string => Boolean(value));
    const mappedTechnologyTypes = suggestions.technologyTypes.map(
      technologyResourceType,
    );

    set({
      teachingMethodIds,
      studentLearningActivities: [
        ...draft.studentLearningActivities,
        ...newActivities,
      ],
      teachingResourceTypes: [
        ...new Set([
          ...draft.teachingResourceTypes,
          ...mappedResourceTypes,
          ...mappedTechnologyTypes,
        ]),
      ],
      assessment: suggestions.assessments[0]?.name ?? draft.assessment,
    });
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 rounded-lg bg-primary/10 p-1.5 text-primary">
            <Lightbulb className="h-4 w-4" />
          </span>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              Course Suggestions
            </h4>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              From Teaching &amp; Learning, linked CLOs, and Assessment. Use only
              what fits this week.
            </p>
          </div>
        </div>
        {suggestionCount > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={useAll}
          >
            Use all
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading suggestions…
        </div>
      ) : error ? (
        <p className="mt-4 text-xs text-muted-foreground">{error}</p>
      ) : draft.cloCodes.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Link at least one CLO to receive contextual suggestions.
        </p>
      ) : suggestionCount === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No matching suggestions yet. Add course-level choices in Teaching &amp;
          Learning or schedule assessments.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <SuggestionGroup title="Teaching methods">
            {suggestions.teachingMethods.map((method) => (
              <SuggestionChip
                key={method.id}
                label={method.name}
                used={draft.teachingMethodIds.includes(method.id)}
                onUse={() => addTeachingMethod(method.id)}
              />
            ))}
          </SuggestionGroup>

          <SuggestionGroup title="Active learning">
            {suggestions.activeLearningStrategies.map((strategy) => (
              <SuggestionChip
                key={strategy.id}
                label={strategy.label}
                used={hasActivity(draft, strategy.label)}
                onUse={() => addActivity(strategy.label)}
              />
            ))}
          </SuggestionGroup>

          <SuggestionGroup title="Independent learning">
            {suggestions.independentLearningTypes.map((item) => (
              <SuggestionChip
                key={item}
                label={item}
                used={hasActivity(draft, item)}
                onUse={() => addActivity(item)}
              />
            ))}
          </SuggestionGroup>

          <SuggestionGroup title="Resources & tools">
            {suggestions.resourceTypes.map((item) => (
              <SuggestionChip
                key={item}
                label={item}
                used={Boolean(
                  WEEK_RESOURCE_TYPE_MAP[item] &&
                    draft.teachingResourceTypes.includes(
                      WEEK_RESOURCE_TYPE_MAP[item],
                    ),
                )}
                onUse={() => addResource(item)}
              />
            ))}
            {suggestions.technologyTypes.map((item) => (
              <SuggestionChip
                key={item}
                label={item}
                used={draft.teachingResourceTypes.includes(
                  technologyResourceType(item),
                )}
                onUse={() => addTechnology(item)}
              />
            ))}
          </SuggestionGroup>

          <SuggestionGroup title="Assessment due this week">
            {suggestions.assessments.map((assessment) => (
              <SuggestionChip
                key={assessment.id}
                label={`${assessment.name}${assessment.weight ? ` · ${assessment.weight}%` : ""}`}
                used={draft.assessment === assessment.name}
                onUse={() => addAssessment(assessment)}
              />
            ))}
          </SuggestionGroup>
        </div>
      )}
    </div>
  );
}

function hasActivity(draft: WeekForm, title: string) {
  return draft.studentLearningActivities.some(
    (activity) => activity.title.toLowerCase() === title.toLowerCase(),
  );
}

function makeSuggestedActivity(title: string): StudentLearningActivity {
  return {
    id: crypto.randomUUID(),
    title,
    description: "Suggested from the course Teaching & Learning strategy.",
    lloIds: [],
  };
}

function technologyResourceType(technology: string) {
  return technology === "LMS" || technology === "Discussion Forum"
    ? "WEBSITE"
    : "SOFTWARE_TOOL";
}

function SuggestionGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  if (Array.isArray(items) && items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function SuggestionChip({
  label,
  used,
  onUse,
}: {
  label: string;
  used: boolean;
  onUse: () => void;
}) {
  return (
    <button
      type="button"
      disabled={used}
      onClick={onUse}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        used
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
          : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5"
      }`}
    >
      {used ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
      {label}
    </button>
  );
}

function countSuggestions(suggestions: WeekSuggestions): number {
  return (
    suggestions.teachingMethods.length +
    suggestions.activeLearningStrategies.length +
    suggestions.independentLearningTypes.length +
    suggestions.resourceTypes.length +
    suggestions.technologyTypes.length +
    suggestions.assessments.length
  );
}
