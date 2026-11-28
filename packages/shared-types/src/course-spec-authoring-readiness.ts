import {
  COMPLETABLE_SPEC_SECTIONS,
  teachingLearningIsReady,
  type CourseSpecSessionType,
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
  sltHours?: number | string | null;
};

export type CourseSpecReadinessAssessment = {
  status: "active" | "inactive";
  cloCodes: readonly string[];
  physicalSltHours?: number | string | null;
  onlineSltHours?: number | string | null;
  independentSltHours?: number | string | null;
};

export type CourseSpecReadinessWeek = {
  topic: string;
  sessionType?: CourseSpecSessionType | null;
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
  slt?: CourseSpecSltOptions;
};

/** Storage/calendar authoring bound, not an academic instructional-week rule. */
export const MAX_COURSE_SPEC_INSTRUCTIONAL_WEEKS = 52;

const ASSESSMENT_ONLY_TOPIC =
  /^(?:(?:mid[- ]?term|final)(?:\s+(?:(?:written|practical|oral)\s+)?(?:exam(?:ination)?|quiz|assessment))?|final\s+exam(?:ination)?\s*:\s*.*|exam(?:ination)?\s*:\s*.*)$/i;

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

type SessionTypeEvidence = Pick<CourseSpecReadinessWeek, "topic" | "sessionType" | "assessment" | "assessmentMethodIds">;

export const COURSE_SPEC_SESSION_TYPE_LABELS: Record<CourseSpecSessionType, string> = {
  teaching: "Teaching",
  assessment: "Assessment",
  teaching_and_assessment: "Teaching + Assessment",
};

export function courseSpecHasWeekAssessment(week: Pick<CourseSpecReadinessWeek, "assessment" | "assessmentMethodIds">): boolean {
  return (week.assessmentMethodIds ?? []).some((id) => id.trim().length > 0) ||
    ((week.assessment ?? "").trim().length > 0 && !/^0(?:\.0+)?%?$/.test((week.assessment ?? "").trim()));
}

/** Explicit choices take precedence. Legacy exam titles and assessment evidence are read-only inference. */
export function courseSpecSessionType(week: SessionTypeEvidence): CourseSpecSessionType {
  if (week.sessionType != null) return week.sessionType;
  if (ASSESSMENT_ONLY_TOPIC.test(week.topic.trim())) return "assessment";
  return courseSpecHasWeekAssessment(week) ? "teaching_and_assessment" : "teaching";
}

export function isCourseSpecAssessmentOnlyWeek(week: SessionTypeEvidence): boolean {
  return courseSpecSessionType(week) === "assessment";
}

/** All instructional sessions count; a calendar policy may flag counts but never truncate rows. */
export function courseSpecInstructionalWeeks<T extends SessionTypeEvidence>(weeks: readonly T[]): T[] {
  return weeks.filter((week) => !isCourseSpecAssessmentOnlyWeek(week));
}

/** Preserve old blank exam placeholders for audit; actual assessment sessions participate in readiness. */
export function courseSpecPlannedWeeks<T extends CourseSpecReadinessWeek>(weeks: readonly T[]): T[] {
  return weeks.filter((week) => week.sessionType != null ||
    !isCourseSpecAssessmentOnlyWeek(week) ||
    week.cloCodes.length > 0 || courseSpecHasWeekAssessment(week) ||
    [week.lectureHours, week.tutorialHours, week.practiceHours, week.otherHours, week.selfStudyHours]
      .some((hour) => numericHour(hour) > 0));
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
  const type = courseSpecSessionType(week);
  if (type !== "assessment") {
    if (!hasLlo) issues.push("LLO");
    if (!(week.teachingMethodIds ?? []).some((id) => id.trim().length > 0)) issues.push("Teaching method");
    if (!hasActivity) issues.push("Learning activity");
  }
  if (slt <= 0 || weekHours(week).some(invalidSltHour)) issues.push("Learning time");
  if (type !== "teaching" && !courseSpecHasWeekAssessment(week)) issues.push("Assessment");
  return issues;
}

export function isCourseSpecWeeklyPlanReady(
  weeks: readonly CourseSpecReadinessWeek[],
): boolean {
  const planned = courseSpecPlannedWeeks(weeks);
  return (
    courseSpecInstructionalWeeks(planned).length > 0 &&
    planned.every(
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

  const reconciliation = options.slt ? reconcileCourseSpecSlt(weeks, clos, assessments, options.slt) : null;
  effective.slt = isCourseSpecWeeklyPlanReady(weeks) && !reconciliation?.blocking.length
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

type SltHour = number | string | null | undefined;
export type CourseSpecSltOptions = {
  declaredHours: SltHour;
  /** No institutional accounting convention is selected until authorized. */
  accountingMode?: "inclusive" | "separate";
  minInstructionalWeeks?: number;
  maxInstructionalWeeks?: number;
  requireCloAllocation?: boolean;
  requireAssessmentAllocation?: boolean;
};

function suppliedSltHour(value: SltHour): boolean {
  return value != null && String(value).trim() !== "";
}
function invalidSltHour(value: SltHour): boolean {
  return suppliedSltHour(value) && (!Number.isFinite(Number(value)) || Number(value) < 0);
}
function weekHours(week: CourseSpecReadinessWeek): SltHour[] {
  return [week.lectureHours, week.tutorialHours, week.practiceHours, week.otherHours, week.selfStudyHours];
}
function assessmentHours(item: CourseSpecReadinessAssessment): SltHour[] {
  return [item.physicalSltHours, item.onlineSltHours, item.independentSltHours];
}
const sumHours = (values: readonly SltHour[]) => values.reduce<number>((sum, value) => sum + numericHour(value), 0);
// Technical tolerance only, not an institutional rounding rule.
const sameHours = (a: number, b: number) => Math.abs(a - b) < 1e-8;

/**
 * Read-only reconciliation. Weekly-inclusive and instructional-plus-assessment
 * are alternative candidate ledgers, never added together. A numeric match
 * does not prove non-overlap or establish an approved institutional policy.
 */
export function reconcileCourseSpecSlt(
  weeks: readonly CourseSpecReadinessWeek[],
  clos: readonly CourseSpecReadinessClo[],
  assessments: readonly CourseSpecReadinessAssessment[],
  options: CourseSpecSltOptions,
) {
  const planned = courseSpecPlannedWeeks(weeks);
  const instructional = courseSpecInstructionalWeeks(planned);
  const activeClos = clos.filter(clo => clo.status === "active");
  const activeAssessments = assessments.filter(item => item.status === "active");
  const weeklyTotal = sumHours(planned.flatMap(weekHours));
  const instructionalTotal = sumHours(instructional.flatMap(weekHours));
  const assessmentTotal = sumHours(activeAssessments.flatMap(assessmentHours));
  const cloTotal = sumHours(activeClos.map(clo => clo.sltHours));
  const missingCloAllocations = activeClos.filter(clo => !suppliedSltHour(clo.sltHours)).length;
  const missingAssessmentAllocations = activeAssessments.filter(item => assessmentHours(item).some(value => !suppliedSltHour(value))).length;
  const declared = suppliedSltHour(options.declaredHours) ? numericHour(options.declaredHours) : null;
  const separateTotal = instructionalTotal + assessmentTotal;
  const blocking: string[] = [];
  const warnings: string[] = [];
  if ([...weeks.flatMap(weekHours), ...activeAssessments.flatMap(assessmentHours), ...activeClos.map(clo => clo.sltHours)].some(invalidSltHour)) blocking.push("invalid-hours");
  if (declared == null || declared <= 0 || invalidSltHour(options.declaredHours)) blocking.push("missing-or-invalid-declared-hours");
  const inclusiveMatches = declared != null && sameHours(weeklyTotal, declared);
  const separateMatches = declared != null && missingAssessmentAllocations === 0 && sameHours(separateTotal, declared);
  if (options.accountingMode === "inclusive" ? !inclusiveMatches : options.accountingMode === "separate" ? !separateMatches : !inclusiveMatches && !separateMatches) blocking.push("total-mismatch");
  if (missingCloAllocations > 0) (options.requireCloAllocation ? blocking : warnings).push("missing-clo-allocation");
  else if (declared != null && activeClos.length > 0 && !sameHours(cloTotal, declared)) blocking.push("clo-total-mismatch");
  if (missingAssessmentAllocations > 0) (options.requireAssessmentAllocation ? blocking : warnings).push("missing-assessment-allocation");
  if (declared != null && assessmentTotal > declared && !sameHours(assessmentTotal, declared)) blocking.push("assessment-exceeds-declared");
  // An inclusive ledger can contain assessment as a subset only. Even a
  // matching total cannot establish per-session allocation without evidence.
  if (assessmentTotal > 0 && weeklyTotal > 0) warnings.push("verify-assessment-overlap");
  if (!options.accountingMode) warnings.push("accounting-policy-unconfirmed");
  if (options.minInstructionalWeeks != null && instructional.length < options.minInstructionalWeeks) blocking.push("instructional-weeks-below-policy");
  if (options.maxInstructionalWeeks != null && instructional.length > options.maxInstructionalWeeks) blocking.push("instructional-weeks-above-policy");
  return { declared, weeklyTotal, instructionalTotal, assessmentOnlyTotal: weeklyTotal - instructionalTotal, assessmentTotal, separateTotal, cloTotal, missingCloAllocations, missingAssessmentAllocations, instructionalWeeks: instructional.length, inclusiveMatches, separateMatches, blocking, warnings };
}
