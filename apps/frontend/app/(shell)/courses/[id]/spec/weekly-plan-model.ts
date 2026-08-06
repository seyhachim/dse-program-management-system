import type {
  LessonLearningOutcome,
  StudentLearningActivity,
  WeeklyPlanSection,
} from "@dse-pms/shared-types";

/**
 * The Weekly Plan (§18) held as a form model for input binding, converted on save
 * by the wizard. Hours are kept as strings so empty inputs stay empty rather than 0.
 */
export type WeekForm = {
  id: string;
  week: string;
  topic: string;
  cloCodes: string[];
  lloItems: string[];
  lessonLearningOutcomes: LessonLearningOutcome[];
  activities: string[];
  studentLearningActivities: StudentLearningActivity[];
  lectureHours: string;
  tutorialHours: string;
  practiceHours: string;
  otherHours: string;
  selfStudyHours: string;
  assessmentMethodIds: string[];
  assessment: string;
};

export type WeeklyPlanForm = WeekForm[];

export const EMPTY_WEEKLY_PLAN: WeeklyPlanForm = [];

const uuid = () => globalThis.crypto.randomUUID();
const str = (v: unknown) => (v == null ? "" : String(v));
const strArray = (v: unknown) =>
  Array.isArray(v) ? v.map((x) => String(x)) : [];

const lessonLearningOutcomeArray = (
  value: unknown,
): LessonLearningOutcome[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return [];
    }

    const item = raw as Record<string, unknown>;

    const id = str(item.id);
    const description = str(item.description);

    if (!id) return [];

    return [
      {
        id,
        description,
      },
    ];
  });
};
const studentLearningActivityArray = (
  value: unknown,
): StudentLearningActivity[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return [];
    }

    const item = raw as Record<string, unknown>;

    const id = str(item.id);
    const title = str(item.title).trim();

    if (!id || !title) return [];

    return [
      {
        id,
        title,
        description: str(item.description),
        lloIds: strArray(item.lloIds),
      },
    ];
  });
};
/** A fresh week, numbered one past the current highest week. */
export function emptyWeek(existing: WeeklyPlanForm): WeekForm {
  const nextNo =
    existing.reduce((max, w) => Math.max(max, Number(w.week) || 0), 0) + 1;
  return {
    id: uuid(),
    week: String(nextNo),
    topic: "",
    cloCodes: [],
    lloItems: [],
    lessonLearningOutcomes: [],
    activities: [],
    studentLearningActivities: [],
    lectureHours: "",
    tutorialHours: "",
    practiceHours: "",
    otherHours: "",
    selfStudyHours: "",
    assessmentMethodIds: [],

    assessment: "",
  };
}

/**
 * Map the API's §18 payload into the form model. Tolerates the retired §16 grid
 * shape (which had no `weeks` array) by yielding an empty plan. Also folds a week's
 * legacy single `contactHours` figure (saved before Contact Hours was split into
 * Lecture/Tutorial/Practice/Other) into `lectureHours` when no breakdown is present,
 * so pre-existing weeks keep a correct total/SLT until next saved in the new shape —
 * the same read-only migration `toClosForm` does for the retired §15 `cloMapping`.
 */
export function toWeeklyPlanForm(data: unknown): WeeklyPlanForm {
  const weeks = (data as { weeks?: unknown[] } | undefined)?.weeks ?? [];
  return weeks
    .map((raw) => {
      const d = (raw ?? {}) as Record<string, unknown>;
      const hasHourBreakdown =
        d.lectureHours != null ||
        d.tutorialHours != null ||
        d.practiceHours != null ||
        d.otherHours != null;
      const legacyContactHours =
        !hasHourBreakdown && d.contactHours != null
          ? String(d.contactHours)
          : "";

      const legacyLloItems = strArray(d.lloItems);

      const storedLessonLearningOutcomes = lessonLearningOutcomeArray(
        d.lessonLearningOutcomes,
      );

      const lessonLearningOutcomes =
        storedLessonLearningOutcomes.length > 0
          ? storedLessonLearningOutcomes
          : legacyLloItems
              .map((description) => description.trim())
              .filter(Boolean)
              .map((description) => ({
                id: uuid(),
                description,
              }));
      const rawStudentLearningActivities = studentLearningActivityArray(
        d.studentLearningActivities,
      );

      const studentLearningActivities = rawStudentLearningActivities.map(
        (activity) => ({
          ...activity,

          lloIds: activity.lloIds
            .map((lloId) => {
              // Already a stable ID — keep it.
              if (lessonLearningOutcomes.some((llo) => llo.id === lloId)) {
                return lloId;
              }

              // Legacy positional reference: "LLO1", "LLO2", ...
              const match = /^LLO(\d+)$/i.exec(lloId);

              if (!match) {
                return null;
              }

              const index = Number(match[1]) - 1;

              return lessonLearningOutcomes[index]?.id ?? null;
            })
            .filter((id): id is string => id !== null),
        }),
      );
      return {
        id: str(d.id) || uuid(),
        week: str(d.week),
        topic: str(d.topic),
        cloCodes: strArray(d.cloCodes),
        lloItems: legacyLloItems,
        lessonLearningOutcomes,
        activities: strArray(d.activities),
        studentLearningActivities,
        lectureHours:
          d.lectureHours == null ? legacyContactHours : String(d.lectureHours),
        tutorialHours: d.tutorialHours == null ? "" : String(d.tutorialHours),
        practiceHours: d.practiceHours == null ? "" : String(d.practiceHours),
        otherHours: d.otherHours == null ? "" : String(d.otherHours),
        selfStudyHours:
          d.selfStudyHours == null ? "" : String(d.selfStudyHours),
        assessmentMethodIds: strArray(d.assessmentMethodIds),
        assessment: str(d.assessment),
      };
    })
    .sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0));
}

/** Convert the form model into the WeeklyPlanSection payload the API validates. */
export function toWeeklyPlanPayload(form: WeeklyPlanForm): WeeklyPlanSection {
  return {
    weeks: form.map((w) => {
      const lessonLearningOutcomes = w.lessonLearningOutcomes
        .map((llo) => ({
          id: llo.id,
          description: llo.description.trim(),
        }))
        .filter((llo) => llo.description.length > 0);

      const validLloIds = new Set(lessonLearningOutcomes.map((llo) => llo.id));

      return {
        id: w.id,
        week: Number(w.week) || 1,
        topic: w.topic.trim(),
        cloCodes: w.cloCodes,

        // New source of truth with stable IDs.
        lessonLearningOutcomes,

        // Legacy representation kept synchronized for old consumers.
        lloItems: lessonLearningOutcomes.map((llo) => llo.description),

        // Legacy activities retained for backward compatibility.
        activities: w.activities,

        // Structured activities reference stable LLO IDs.
        studentLearningActivities: w.studentLearningActivities.map(
          (activity) => ({
            id: activity.id,
            title: activity.title.trim(),
            description: activity.description.trim(),

            // Never persist references to an LLO that no longer exists.
            lloIds: activity.lloIds.filter((id) => validLloIds.has(id)),
          }),
        ),

        lectureHours: w.lectureHours === "" ? null : Number(w.lectureHours),

        tutorialHours: w.tutorialHours === "" ? null : Number(w.tutorialHours),

        practiceHours: w.practiceHours === "" ? null : Number(w.practiceHours),

        otherHours: w.otherHours === "" ? null : Number(w.otherHours),

        selfStudyHours:
          w.selfStudyHours === "" ? null : Number(w.selfStudyHours),

        assessment: w.assessment.trim(),
      };
    }),
  } as WeeklyPlanSection;
}

/** Contact Hours for the form model: Lecture + Tutorial + Practice + Other (blank counts as 0). */
export function weekContactHoursForm(w: WeekForm): number {
  return (
    (Number(w.lectureHours) || 0) +
    (Number(w.tutorialHours) || 0) +
    (Number(w.practiceHours) || 0) +
    (Number(w.otherHours) || 0)
  );
}

/** Weekly SLT for the form model: Contact Hours (L+T+P+O) + Self-Study (blank counts as 0). */
export function weekSltForm(w: WeekForm): number {
  return weekContactHoursForm(w) + (Number(w.selfStudyHours) || 0);
}

/** Footer totals across the form model. */
export function weeklyPlanFormTotals(form: WeeklyPlanForm) {
  return form.reduce(
    (acc, w) => {
      acc.lectureHours += Number(w.lectureHours) || 0;
      acc.tutorialHours += Number(w.tutorialHours) || 0;
      acc.practiceHours += Number(w.practiceHours) || 0;
      acc.otherHours += Number(w.otherHours) || 0;
      acc.selfStudyHours += Number(w.selfStudyHours) || 0;
      acc.slt += weekSltForm(w);
      return acc;
    },
    {
      lectureHours: 0,
      tutorialHours: 0,
      practiceHours: 0,
      otherHours: 0,
      selfStudyHours: 0,
      slt: 0,
    },
  );
}

/** A CLO's coverage across the plan: how many weeks reference it. */
export type CloCoverage = { code: string; weeks: number };
/** A CLO's allocated SLT derived from the Weekly Plan. */
export type CloSltAllocation = {
  code: string;
  sltHours: number;
};

/**
 * Allocate each week's SLT equally across the CLOs linked to that week.
 *
 * Example:
 * - Week SLT = 6h, linked to CLO1       → CLO1 receives 6h
 * - Week SLT = 8h, linked to CLO1,CLO2 → each receives 4h
 *
 * Duplicate CLO codes within a week are ignored.
 * Weeks with no linked CLOs do not contribute to CLO allocation.
 */
export function cloSltAllocation(
  form: WeeklyPlanForm,
  cloCodes?: string[],
): CloSltAllocation[] {
  const allocations = new Map<string, number>();

  // Include known CLOs even when they currently receive 0 hours.
  for (const code of cloCodes ?? []) {
    allocations.set(code, 0);
  }

  for (const week of form) {
    const linkedCodes = [...new Set(week.cloCodes)].filter(
      (code) => !cloCodes || allocations.has(code),
    );

    if (linkedCodes.length === 0) continue;

    const weekSlt = weekSltForm(week);
    const share = weekSlt / linkedCodes.length;

    for (const code of linkedCodes) {
      allocations.set(code, (allocations.get(code) ?? 0) + share);
    }
  }

  return [...allocations.entries()]
    .map(([code, sltHours]) => ({
      code,
      sltHours,
    }))
    .sort(
      (a, b) =>
        (Number(a.code.replace(/\D/g, "")) || 0) -
        (Number(b.code.replace(/\D/g, "")) || 0),
    );
}
/**
 * Per-CLO week counts for the coverage chart. When `cloCodes` is given (the §14
 * CLO list) it drives the set so uncovered CLOs still show as 0; otherwise the
 * codes are derived from the weeks themselves.
 */
export function cloCoverage(
  form: WeeklyPlanForm,
  cloCodes?: string[],
): CloCoverage[] {
  const counts = new Map<string, number>();
  for (const code of cloCodes ?? []) counts.set(code, 0);
  for (const w of form) {
    for (const code of new Set(w.cloCodes)) {
      if (cloCodes && !counts.has(code)) continue; // ignore codes not in the CLO list
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, weeks]) => ({ code, weeks }))
    .sort(
      (a, b) =>
        (Number(a.code.replace(/\D/g, "")) || 0) -
        (Number(b.code.replace(/\D/g, "")) || 0),
    );
}

/** Rolled-up figures for the Weekly Plan Summary panel. */
export function weeklyPlanSummary(form: WeeklyPlanForm) {
  const totals = weeklyPlanFormTotals(form);
  const contactHours =
    totals.lectureHours +
    totals.tutorialHours +
    totals.practiceHours +
    totals.otherHours;
  const assessments = form.filter((w) => w.assessment.trim()).length;
  const isProject = (w: WeekForm) =>
    /project/i.test(w.topic) ||
    /project/i.test(w.assessment) ||
    w.activities.some((a) => /project/i.test(a)) ||
    w.studentLearningActivities.some(
      (a) => /project/i.test(a.title) || /project/i.test(a.description),
    );
  const projectWeeks = form
    .filter(isProject)
    .map((w) => Number(w.week))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  return {
    totalWeeks: form.length,
    contactHours,
    selfStudyHours: totals.selfStudyHours,
    slt: totals.slt,
    assessments,
    projectWeeks,
  };
}

/* ---------------------------------------------------------------- CLO chart colours */

/** Solid colour values for a CLO donut/legend, parallel to the chip palette above. */
const CLO_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#f43f5e",
  "#ec4899",
];

/** CSS colour for a CLO code (e.g. "CLO3"), matching {@link cloChip} by number. */
export function cloColor(code: string): string {
  const n = Number(code.replace(/\D/g, ""));
  if (!n) return "var(--muted-foreground)";
  return CLO_COLORS[(n - 1) % CLO_COLORS.length]!;
}

/* ------------------------------------------------------------- CLO badge palette */

/** Chip colours for a CLO badge, cycled by CLO number (CLO1 blue, CLO2 green, …). */
const CLO_CHIPS = [
  "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  "bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
];

/** Tailwind chip classes for a CLO code (e.g. "CLO3"), cycling the palette by number. */
export function cloChip(code: string): string {
  const n = Number(code.replace(/\D/g, ""));
  if (!n) return "bg-muted text-muted-foreground";
  return CLO_CHIPS[(n - 1) % CLO_CHIPS.length]!;
}
