import type { AssessmentPlanSection } from "@dse-pms/shared-types";

/**
 * An assessment (§17) held as a form model for input binding; converted on save by
 * the wizard. Numeric fields are kept as strings so empty inputs stay empty rather
 * than 0, matching the CLO / Weekly Plan form models.
 *
 * `countsTowardGrade` is an explicit UX concept while the persisted backward-
 * compatible contract continues to use a nullable local `weight`: checked means a
 * positive course-grade weight is expected; unchecked persists `weight: null`.
 * CLO evidence remains independent in `cloCodes`.
 */
export type AssessmentForm = {
  id: string;
  name: string;
  type: string;
  description: string;
  mode: "individual" | "group";
  status: "active" | "inactive";
  cloCodes: string[];
  countsTowardGrade: boolean;
  weight: string;
  dueWeek: string;
  durationWeeks: string;
  format: string;
  submissionMethod: string;
  instructions: string;
  rubricId: string;
  feedbackMethod: string;
  feedbackTimeline: string;
  mappedPlos: string[];
  notes: string;
  assessmentCategory: "continuous" | "final";
  topicNumbers: number[];
  physicalSltHours: string;
  onlineSltHours: string;
  independentSltHours: string;
};

export type AssessmentTemplatePayload = {
  items: Array<{
    assessmentId: string;
    assessmentCategory: "continuous" | "final";
    topicNumbers: number[];
    physicalSltHours: number | null;
    onlineSltHours: number | null;
    independentSltHours: number | null;
  }>;
};

export type AssessmentPlanSavePayload = AssessmentPlanSection & {
  templateMetadata: AssessmentTemplatePayload;
};

export const EMPTY_ASSESSMENTS: AssessmentForm[] = [];

const uuid = () => globalThis.crypto.randomUUID();
const str = (v: unknown) => (v == null ? "" : String(v));
const strArray = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => String(x)) : [];
const topicArray = (v: unknown) =>
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
    countsTowardGrade: true,
    weight: "",
    dueWeek: "",
    durationWeeks: "",
    format: "",
    submissionMethod: "",
    instructions: "",
    rubricId: "",
    feedbackMethod: "",
    feedbackTimeline: "",
    mappedPlos: [],
    notes: "",
    assessmentCategory: "continuous",
    topicNumbers: [],
    physicalSltHours: "",
    onlineSltHours: "",
    independentSltHours: "",
  };
}

/** Map the API's §17 payload into the string-based form model. */
export function toAssessmentForm(data: unknown): AssessmentForm[] {
  const items = (data as { items?: unknown[] } | undefined)?.items ?? [];
  return items.map((raw) => {
    const d = (raw ?? {}) as Record<string, unknown>;
    const weight = d.weight == null ? "" : String(d.weight);
    return {
      id: str(d.id) || uuid(),
      name: str(d.name),
      type: str(d.type) || "Assignment",
      description: str(d.description),
      mode: d.mode === "group" ? "group" : "individual",
      status: d.status === "inactive" ? "inactive" : "active",
      cloCodes: strArray(d.cloCodes),
      countsTowardGrade: weight !== "" && Number(weight) > 0,
      weight,
      dueWeek: d.dueWeek == null ? "" : String(d.dueWeek),
      durationWeeks: d.durationWeeks == null ? "" : String(d.durationWeeks),
      format: str(d.format),
      submissionMethod: str(d.submissionMethod),
      instructions: str(d.instructions),
      rubricId: str(d.rubricId),
      feedbackMethod: str(d.feedbackMethod),
      feedbackTimeline: str(d.feedbackTimeline),
      mappedPlos: strArray(d.mappedPlos),
      notes: str(d.notes),
      assessmentCategory:
        d.assessmentCategory === "final" ? "final" : "continuous",
      topicNumbers: topicArray(d.topicNumbers),
      physicalSltHours:
        d.physicalSltHours == null ? "" : String(d.physicalSltHours),
      onlineSltHours:
        d.onlineSltHours == null ? "" : String(d.onlineSltHours),
      independentSltHours:
        d.independentSltHours == null ? "" : String(d.independentSltHours),
    };
  });
}

function toAssessmentTemplatePayload(
  items: AssessmentForm[],
): AssessmentTemplatePayload {
  return {
    items: items.map((a) => ({
      assessmentId: a.id,
      assessmentCategory: a.assessmentCategory,
      topicNumbers: a.topicNumbers,
      physicalSltHours:
        a.physicalSltHours === "" ? null : Number(a.physicalSltHours),
      onlineSltHours:
        a.onlineSltHours === "" ? null : Number(a.onlineSltHours),
      independentSltHours:
        a.independentSltHours === "" ? null : Number(a.independentSltHours),
    })),
  };
}

/**
 * Convert the form into the existing assessment payload plus metadata that the
 * API client persists through the dedicated §16/§17 metadata endpoint.
 */
export function toAssessmentPayload(
  items: AssessmentForm[],
): AssessmentPlanSavePayload {
  return {
    items: items.map((a) => ({
      id: a.id,
      name: a.name.trim(),
      type: a.type,
      description: a.description.trim(),
      mode: a.mode,
      status: a.status,
      cloCodes: a.cloCodes,
      weight:
        !a.countsTowardGrade || a.weight === "" ? null : Number(a.weight),
      dueWeek: a.dueWeek === "" ? null : Number(a.dueWeek),
      durationWeeks: a.durationWeeks === "" ? null : Number(a.durationWeeks),
      format: a.format.trim(),
      submissionMethod: a.submissionMethod.trim(),
      instructions: a.instructions.trim(),
      rubricId: a.rubricId === "" ? null : a.rubricId,
      feedbackMethod: a.feedbackMethod.trim(),
      feedbackTimeline: a.feedbackTimeline.trim(),
      mappedPlos: a.mappedPlos,
      notes: a.notes.trim(),
    })),
    templateMetadata: toAssessmentTemplatePayload(items),
  } as AssessmentPlanSavePayload;
}

export function assessmentSltHours(item: AssessmentForm): number {
  return (
    (Number(item.physicalSltHours) || 0) +
    (Number(item.onlineSltHours) || 0) +
    (Number(item.independentSltHours) || 0)
  );
}

/** Total local course-grade weight (%) across active graded assessments. */
export function assessmentTotalWeight(items: AssessmentForm[]): number {
  return items
    .filter((a) => a.status === "active" && a.countsTowardGrade)
    .reduce((sum, a) => sum + (Number(a.weight) || 0), 0);
}

export function assessmentEvidenceLabel(item: Pick<AssessmentForm, "cloCodes" | "countsTowardGrade">): string {
  if (item.countsTowardGrade && item.cloCodes.length === 0) return "Grade only";
  if (!item.countsTowardGrade && item.cloCodes.length > 0) return "CLO evidence only";
  if (!item.countsTowardGrade && item.cloCodes.length === 0) return "Formative / neither";
  return "Grade + CLO evidence";
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
