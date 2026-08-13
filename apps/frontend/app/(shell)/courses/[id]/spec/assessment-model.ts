import type { AssessmentPlanSection } from "@dse-pms/shared-types";

/**
 * An assessment (§17) held as a form model for input binding; converted on save by
 * the wizard. Numeric fields are kept as strings so empty inputs stay empty rather
 * than 0, matching the CLO / Weekly Plan form models.
 */
export type AssessmentForm = {
  id: string;
  name: string;
  type: string;
  description: string;
  mode: "individual" | "group";
  status: "active" | "inactive";
  cloCodes: string[];
  weight: string;
  dueWeek: string;
  durationWeeks: string;
  assessmentCategory: "continuous" | "final";
  topicNumbers: number[];
  physicalHours: string;
  onlineHours: string;
  independentHours: string;
  format: string;
  submissionMethod: string;
  instructions: string;
  rubric: string;
  feedbackMethod: string;
  feedbackTimeline: string;
  mappedPlos: string[];
  notes: string;
};

export const EMPTY_ASSESSMENTS: AssessmentForm[] = [];

const uuid = () => globalThis.crypto.randomUUID();
const str = (v: unknown) => (v == null ? "" : String(v));
const strArray = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => String(x)) : [];
const numberArray = (v: unknown) =>
  Array.isArray(v)
    ? v
        .map((x) => Number(x))
        .filter((x) => Number.isInteger(x) && x >= 1 && x <= 15)
    : [];

/** A fresh, empty assessment. */
export function emptyAssessment(): AssessmentForm {
  return {
    id: uuid(),
    name: "",
    type: "Assignment",
    description: "",
    mode: "individual",
    status: "active",
    cloCodes: [],
    weight: "",
    dueWeek: "",
    durationWeeks: "",
    assessmentCategory: "continuous",
    topicNumbers: [],
    physicalHours: "",
    onlineHours: "",
    independentHours: "",
    format: "",
    submissionMethod: "",
    instructions: "",
    rubric: "",
    feedbackMethod: "",
    feedbackTimeline: "",
    mappedPlos: [],
    notes: "",
  };
}

/** Map the API's §17 payload into the string-based form model. */
export function toAssessmentForm(data: unknown): AssessmentForm[] {
  const items = (data as { items?: unknown[] } | undefined)?.items ?? [];
  return items.map((raw) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(d.id) || uuid(),
      name: str(d.name),
      type: str(d.type) || "Assignment",
      description: str(d.description),
      mode: d.mode === "group" ? "group" : "individual",
      status: d.status === "inactive" ? "inactive" : "active",
      cloCodes: strArray(d.cloCodes),
      weight: d.weight == null ? "" : String(d.weight),
      dueWeek: d.dueWeek == null ? "" : String(d.dueWeek),
      durationWeeks:
        d.durationWeeks == null ? "" : String(d.durationWeeks),
      assessmentCategory:
        d.assessmentCategory === "final" ? "final" : "continuous",
      topicNumbers: numberArray(d.topicNumbers),
      physicalHours:
        d.physicalHours == null ? "" : String(d.physicalHours),
      onlineHours: d.onlineHours == null ? "" : String(d.onlineHours),
      independentHours:
        d.independentHours == null ? "" : String(d.independentHours),
      format: str(d.format),
      submissionMethod: str(d.submissionMethod),
      instructions: str(d.instructions),
      rubric: str(d.rubric),
      feedbackMethod: str(d.feedbackMethod),
      feedbackTimeline: str(d.feedbackTimeline),
      mappedPlos: strArray(d.mappedPlos),
      notes: str(d.notes),
    };
  });
}

function numberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

/** Convert the form model into the AssessmentPlanSection payload the API validates. */
export function toAssessmentPayload(
  items: AssessmentForm[],
): AssessmentPlanSection {
  return {
    items: items.map((a) => ({
      id: a.id,
      name: a.name.trim(),
      type: a.type,
      description: a.description.trim(),
      mode: a.mode,
      status: a.status,
      cloCodes: a.cloCodes,
      weight: numberOrNull(a.weight),
      dueWeek: numberOrNull(a.dueWeek),
      durationWeeks: numberOrNull(a.durationWeeks),
      assessmentCategory: a.assessmentCategory,
      topicNumbers: [...a.topicNumbers].sort((a, b) => a - b),
      physicalHours: numberOrNull(a.physicalHours),
      onlineHours: numberOrNull(a.onlineHours),
      independentHours: numberOrNull(a.independentHours),
      format: a.format.trim(),
      submissionMethod: a.submissionMethod.trim(),
      instructions: a.instructions.trim(),
      rubric: a.rubric.trim(),
      feedbackMethod: a.feedbackMethod.trim(),
      feedbackTimeline: a.feedbackTimeline.trim(),
      mappedPlos: a.mappedPlos,
      notes: a.notes.trim(),
    })),
  } as AssessmentPlanSection;
}

/** Total weight (%) across active assessments — the plan should sum to 100. */
export function assessmentTotalWeight(items: AssessmentForm[]): number {
  return items
    .filter((a) => a.status === "active")
    .reduce((sum, a) => sum + (Number(a.weight) || 0), 0);
}

/** Explicit assessment SLT. No value is invented when all three components are blank. */
export function assessmentSltHours(item: AssessmentForm): number | null {
  const values = [item.physicalHours, item.onlineHours, item.independentHours];
  if (values.every((value) => value.trim() === "")) return null;
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
}

/* ------------------------------------------------------------- type badge palette */

/** Chip colours for an assessment type badge, keyed by type. */
const TYPE_CHIPS: Record<string, string> = {
  Assignment:
    "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  Quiz: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  Exam: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  Lab: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  Project:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  Presentation:
    "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300",
  Report: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  "Peer Evaluation":
    "bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
  Participation:
    "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
};

/** Tailwind chip classes for an assessment type. */
export function assessmentTypeChip(type: string): string {
  return TYPE_CHIPS[type] ?? "bg-muted text-muted-foreground";
}
