import {
  COMPLETABLE_SPEC_SECTIONS,
  teachingLearningIsReady,
  type SpecSectionId,
  type SpecSectionStatus,
  type TeachingLearningProfile,
} from "./course-spec.ts";
import { isConstructiveAlignmentReady } from "./course-spec-alignment-readiness.ts";

export type CourseSpecAuthoringSectionId = SpecSectionId | "teachingLearning";

export type CourseSpecAuthoringSection = {
  id: CourseSpecAuthoringSectionId;
  title: string;
};

/**
 * Canonical lecturer-work readiness list. Specification Date is assigned by PMS
 * on first submission, while Teaching & Learning is real authoring work stored
 * outside the original saveable CourseSpec section registry.
 */
export const COURSE_SPEC_AUTHORING_SECTIONS: readonly CourseSpecAuthoringSection[] =
  COMPLETABLE_SPEC_SECTIONS.flatMap((section) => {
    if (section.id === "date") return [];
    if (section.id === "clos") {
      return [
        { id: section.id, title: section.title },
        { id: "teachingLearning", title: "Teaching & Learning" },
      ];
    }
    return [{ id: section.id, title: section.title }];
  });

export type CourseSpecReadinessClo = {
  code: string;
  description: string;
  mappedPlos: readonly string[];
  teachingMethodIds: readonly string[];
  status: "active" | "inactive";
};

export type CourseSpecReadinessAssessment = {
  status: "active" | "inactive";
  cloCodes: readonly string[];
};

export type CourseSpecReadinessWeek = {
  topic: string;
  cloCodes: readonly string[];
  lloItems?: readonly string[];
  lessonLearningOutcomes?: unknown;
  activities?: readonly string[];
  studentLearningActivities?: unknown;
  lectureHours?: number | string | null;
  tutorialHours?: number | string | null;
  practiceHours?: number | string | null;
  otherHours?: number | string | null;
  selfStudyHours?: number | string | null;
  teachingMethodIds?: readonly string[];
  assessmentMethodIds?: readonly string[];
  assessment?: string | null;
};

export type CourseSpecWeeklyPlanAttentionIssue =
  | "Topic"
  | "CLO"
  | "LLO"
  | "Teaching method"
  | "Learning activity"
  | "Learning time"
  | "Assessment";

export type CourseSpecReadinessOptions = {
  cloReady?: boolean;
  teachingLearningReady?: boolean;
  teachingLearningProfile?: TeachingLearningProfile | null;
};

export const MAX_COURSE_SPEC_INSTRUCTIONAL_WEEKS = 14;

const ASSESSMENT_ONLY_TOPIC =
  /^(?:mid[- ]?term(?:\s+(?:exam|quiz|assessment))?|final(?:\s+(?:exam|assessment))?|final\s+exam\s*:\s*.*|exam\s*:\s*.*)$/i;

function numericHour(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || !value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function structuredArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasStructuredText(value: unknown, key: string): boolean {
  return structuredArray(value).some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const field = (item as Record<string, unknown>)[key];
    return typeof field === "string" && field.trim().length > 0;
  });
}

export function isCourseSpecAssessmentOnlyWeek(
  week: Pick<CourseSpecReadinessWeek, "topic">,
): boolean {
  return ASSESSMENT_ONLY_TOPIC.test(week.topic.trim());
}

/**
 * Canonical 1–14 instructional subset. Legacy Midterm/Final assessment-only rows
 * remain persisted for audit/history but do not count as teaching weeks.
 */
export function courseSpecInstructionalWeeks<
  T extends Pick<CourseSpecReadinessWeek, "topic">,
>(weeks: readonly T[]): T[] {
  return weeks
    .filter((week) => !isCourseSpecAssessmentOnlyWeek(week))
    .slice(0, MAX_COURSE_SPEC_INSTRUCTIONAL_WEEKS);
}

/** Canonical per-week readiness issues used by CourseSpec authoring/progress. */
export function courseSpecWeeklyPlanWeekAttention(
  week: CourseSpecReadinessWeek,
): CourseSpecWeeklyPlanAttentionIssue[] {
  const structuredLlos = structuredArray(week.lessonLearningOutcomes);
  const hasLlo =
    structuredLlos.length > 0
      ? hasStructuredText(structuredLlos, "description")
      : (week.lloItems ?? []).some((item) => item.trim().length > 0);

  const structuredActivities = structuredArray(week.studentLearningActivities);
  const hasActivity =
    structuredActivities.length > 0
      ? hasStructuredText(structuredActivities, "title")
      : (week.activities ?? []).some((item) => item.trim().length > 0);

  const slt =
    numericHour(week.lectureHours) +
    numericHour(week.tutorialHours) +
    numericHour(week.practiceHours) +
    numericHour(week.otherHours) +
    numericHour(week.selfStudyHours);

  const issues: CourseSpecWeeklyPlanAttentionIssue[] = [];
  if (!week.topic.trim()) issues.push("Topic");
  if (week.cloCodes.length === 0) issues.push("CLO");
  if (!hasLlo) issues.push("LLO");
  if ((week.teachingMethodIds ?? []).length === 0) issues.push("Teaching method");
  if (!hasActivity) issues.push("Learning activity");
  if (slt <= 0) issues.push("Learning time");
  if (
    (week.assessmentMethodIds ?? []).length === 0 &&
    !(week.assessment ?? "").trim()
  ) {
    issues.push("Assessment");
  }
  return issues;
}

export function isCourseSpecWeeklyPlanReady(
  weeks: readonly CourseSpecReadinessWeek[],
): boolean {
  const instructional = courseSpecInstructionalWeeks(weeks);
  return (
    instructional.length > 0 &&
    instructional.every(
      (week) => courseSpecWeeklyPlanWeekAttention(week).length === 0,
    )
  );
}

export function areCourseSpecClosReady(
  clos: readonly CourseSpecReadinessClo[],
): boolean {
  const activeClos = clos.filter((clo) => clo.status === "active");
  return (
    activeClos.length > 0 &&
    activeClos.every(
      (clo) => clo.description.trim().length > 0 && clo.mappedPlos.length > 0,
    )
  );
}

/**
 * Derive the effective readiness state used by lecturer-facing CourseSpec
 * surfaces. Persisted flags remain authoritative for ordinary saved sections,
 * while CLOs, Teaching & Learning, Weekly Plan, and Constructive Alignment are
 * recalculated from their current source data.
 */
export function deriveCourseSpecAuthoringReadinessStatus(
  status: Readonly<Record<string, SpecSectionStatus>>,
  clos: readonly CourseSpecReadinessClo[],
  weeks: readonly CourseSpecReadinessWeek[],
  assessments: readonly CourseSpecReadinessAssessment[],
  options: CourseSpecReadinessOptions = {},
): Record<string, SpecSectionStatus> {
  const effective: Record<string, SpecSectionStatus> = { ...status };
  const instructional = courseSpecInstructionalWeeks(weeks);

  const cloReady = options.cloReady ?? areCourseSpecClosReady(clos);
  effective.clos = cloReady ? "complete" : "draft";

  const teachingLearningReady =
    options.teachingLearningReady ??
    (options.teachingLearningProfile
      ? teachingLearningIsReady(
          options.teachingLearningProfile,
          clos.map((clo) => ({
            status: clo.status,
            teachingMethodIds: [...clo.teachingMethodIds],
          })),
        )
      : false);
  effective.teachingLearning = teachingLearningReady ? "complete" : "draft";

  effective.slt = isCourseSpecWeeklyPlanReady(instructional)
    ? "complete"
    : "draft";

  const alignmentReady = isConstructiveAlignmentReady(
    clos.map((clo) => ({ code: clo.code, status: clo.status })),
    instructional,
    assessments,
  );
  if (alignmentReady) {
    effective.mapping = "complete";
  } else if (
    clos.some((clo) => clo.status === "active") ||
    instructional.length > 0 ||
    assessments.length > 0
  ) {
    effective.mapping = "draft";
  } else {
    delete effective.mapping;
  }

  // Specification Date is assigned by PMS on first submission. It stays
  // effectively complete for compatibility consumers but is not in the canonical
  // lecturer-work section list above.
  effective.date = "complete";
  return effective;
}

export function summarizeCourseSpecAuthoringReadiness(
  status: Readonly<Record<string, SpecSectionStatus>>,
): Pick<CourseSpecProgressSummary, "completed" | "total" | "incompleteSections"> {
  const incompleteSections = COURSE_SPEC_AUTHORING_SECTIONS.filter(
    (section) => status[section.id] !== "complete",
  ).map((section) => ({ id: section.id, title: section.title }));
  return {
    completed: COURSE_SPEC_AUTHORING_SECTIONS.length - incompleteSections.length,
    total: COURSE_SPEC_AUTHORING_SECTIONS.length,
    incompleteSections,
  };
}

type CourseSpecProgressSummary = {
  completed: number;
  total: number;
  incompleteSections: { id: CourseSpecAuthoringSectionId; title: string }[];
};
