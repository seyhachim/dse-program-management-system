import {
  AFFECTIVE_LEVELS,
  CAP_LEVELS,
  cloFocusCode,
  cloFocusPercent,
  COGNITIVE_LEVELS,
  PSYCHOMOTOR_LEVELS,
} from "@dse-pms/shared-types";

/** A CLO held as a form model for input binding; converted on save by the wizard. */
export type CloForm = {
  id: string;
  code: string;
  description: string;
  level: string;
  mappedPlos: string[];
  sltHours: string;
  teachingMethodIds: string[];
  assessmentMethodIds: string[];
  status: "active" | "inactive";
  notes: string;
};

export const EMPTY_CLOS: CloForm[] = [];

/** A fresh, empty CLO (code is assigned by position on save). */
export function emptyClo(): CloForm {
  return {
    id: crypto.randomUUID(),
    code: "",
    description: "",
    level: "",
    mappedPlos: [],
    sltHours: "",
    teachingMethodIds: [],
    assessmentMethodIds: [],
    status: "active",
    notes: "",
  };
}

/** Assign CLO codes by position so they stay sequential after add/remove. */
export function withCodes(items: CloForm[]): CloForm[] {
  return items.map((item, i) => ({ ...item, code: `CLO${i + 1}` }));
}

const asStr = (v: unknown) => (v == null ? "" : String(v));
const asStrArray = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/**
 * Map the API's §14 payload into the string-based form model, migrating legacy
 * fields. `legacyMapping` is the old §15 `cloMapping` section (now removed) — its
 * `sltHours`/`teachingMethodIds` are folded into the matching CLO by code when the
 * CLO itself doesn't already carry them, so courses saved before the §14/§15 merge
 * don't lose that data. It's read-only migration: nothing is written back until the
 * lecturer next saves §14.
 */
export function toClosForm(data: unknown, legacyMapping?: unknown): CloForm[] {
  const items = (data as { items?: unknown[] } | undefined)?.items ?? [];
  const legacyItems = (legacyMapping as { items?: unknown[] } | undefined)?.items ?? [];
  const legacyByCode = new Map(
    legacyItems.map((raw) => {
      const d = (raw ?? {}) as Record<string, unknown>;
      return [asStr(d.cloCode), d] as const;
    }),
  );
  return withCodes(
    items.map((raw) => {
      const d = (raw ?? {}) as Record<string, unknown>;
      // Legacy rows carried a single `ploId`; fold it into mappedPlos.
      const mappedPlos = asStrArray(d.mappedPlos);
      if (mappedPlos.length === 0 && d.ploId) mappedPlos.push(String(d.ploId));
      const legacy = legacyByCode.get(asStr(d.code));
      const teachingMethodIds = asStrArray(d.teachingMethodIds);
      return {
        id: asStr(d.id),
        code: asStr(d.code),
        description: asStr(d.description),
        level: asStr(d.level),
        mappedPlos,
        sltHours: d.sltHours != null ? asStr(d.sltHours) : legacy?.sltHours != null ? asStr(legacy.sltHours) : "",
        teachingMethodIds: teachingMethodIds.length ? teachingMethodIds : asStrArray(legacy?.teachingMethodIds),
        assessmentMethodIds: asStrArray(d.assessmentMethodIds),
        status: d.status === "inactive" ? "inactive" : "active",
        notes: asStr(d.notes),
      };
    }),
  );
}

/** Convert the form model into the ClosSection payload the API validates. */
export function toClosPayload(items: CloForm[]) {
  return {
    items: withCodes(items).map((f) => ({
      id: f.id,
      code: f.code,
      description: f.description.trim(),
      level: f.level || null,
      mappedPlos: f.mappedPlos,
      sltHours: f.sltHours ? Number(f.sltHours) : null,
      teachingMethodIds: f.teachingMethodIds,
      assessmentMethodIds: f.assessmentMethodIds,
      status: f.status,
      notes: f.notes.trim(),
    })),
  };
}

/** A CLO's share of the course's total SLT, as a whole percent (string-input wrapper). */
export function focusPercentOf(sltHours: string, totalSlt: number | null): number | null {
  return cloFocusPercent(sltHours ? Number(sltHours) : null, totalSlt);
}

/** F/M/P category derived from a focus percentage. */
export function focusCodeOf(percent: number | null): string {
  return cloFocusCode(percent) ?? "";
}

/* ------------------------------------------------------------- Bloom palette */

/** Display colours for a Bloom level — chips, dots, and the distribution bar. */
export type BloomStyle = {
  name: string;
  dot: string;
  bar: string;
  chip: string;
};

/** Cognitive levels (C1–C6) carry the reference colour scheme. */
const COGNITIVE_STYLE: Record<string, Omit<BloomStyle, "name">> = {
  C1: { dot: "#3b82f6", bar: "#3b82f6", chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  C2: { dot: "#22c55e", bar: "#22c55e", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  C3: { dot: "#f59e0b", bar: "#f59e0b", chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  C4: { dot: "#8b5cf6", bar: "#8b5cf6", chip: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" },
  C5: { dot: "#ef4444", bar: "#ef4444", chip: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
  C6: { dot: "#ec4899", bar: "#ec4899", chip: "bg-pink-50 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300" },
};

const NEUTRAL_STYLE: Omit<BloomStyle, "name"> = {
  dot: "#94a3b8",
  bar: "#94a3b8",
  chip: "bg-muted text-muted-foreground",
};

/** Look up the display name + palette for a C/A/P level code. */
export function bloomStyle(code: string): BloomStyle {
  const entry = CAP_LEVELS.find((l) => l.code === code);
  const style = COGNITIVE_STYLE[code] ?? NEUTRAL_STYLE;
  return { name: entry?.name ?? code ?? "—", ...style };
}

/** The six cognitive Bloom levels, in order — drives the distribution bar. */
export const BLOOM_COGNITIVE = COGNITIVE_LEVELS;

/* -------------------------------------------------------------- Wizard */

export const STATEMENT_MAX = 300;
export const NOTES_MAX = 300;

export type WizardStepId = 1 | 2 | 3 | 4 | 5;

export const CLO_WIZARD_STEPS: { id: WizardStepId; title: string }[] = [
  { id: 1, title: "CLO Info" },
  { id: 2, title: "PLO Mapping" },
  { id: 3, title: "Learning" },
  { id: 4, title: "Assessment" },
  { id: 5, title: "Review" },
];

/**
 * Fields that block Save entirely — mirrors the shared Zod schema
 * (`description` is the only required §14 CLO field; `level` is nullable and
 * `mappedPlos` defaults to `[]`), so a pre-existing CLO missing those never gets
 * trapped mid-wizard with no way to save.
 */
export function cloWizardErrors(draft: CloForm) {
  return {
    statement: draft.description.trim().length === 0,
  };
}

/**
 * Whether a step's fields are filled in, for the stepper's progress dots and the
 * Review step — advisory only, doesn't block navigation (see `cloWizardErrors`).
 */
export function wizardStepComplete(step: WizardStepId, draft: CloForm): boolean {
  switch (step) {
    case 1:
      return draft.description.trim().length > 0 && draft.level.trim().length > 0;
    case 2:
      return draft.mappedPlos.length > 0;
    case 3:
      return draft.sltHours.trim().length > 0 && draft.teachingMethodIds.length > 0;
    case 4:
      return draft.assessmentMethodIds.length > 0;
    case 5:
      return true;
  }
}

/** Suggested Bloom's action verbs, grouped by domain — powers the wizard's verb-chip helper. */
const BLOOM_VERBS: Record<"cognitive" | "affective" | "psychomotor", string[]> = {
  cognitive: ["Analyze", "Apply", "Design", "Evaluate", "Explain", "Create", "Develop", "Solve"],
  affective: ["Value", "Justify", "Advocate", "Collaborate", "Respond", "Demonstrate"],
  psychomotor: ["Perform", "Operate", "Construct", "Execute", "Adapt", "Demonstrate"],
};

/** Recommended verbs for a level's domain; defaults to the cognitive set when no level is chosen yet. */
export function bloomVerbsFor(level: string): string[] {
  if (AFFECTIVE_LEVELS.some((l) => l.code === level)) return BLOOM_VERBS.affective;
  if (PSYCHOMOTOR_LEVELS.some((l) => l.code === level)) return BLOOM_VERBS.psychomotor;
  return BLOOM_VERBS.cognitive;
}

/** Append a Bloom verb to the end of a CLO statement, clamped to the field's max length. */
export function appendBloomVerb(description: string, verb: string): string {
  const next = description.trim().length > 0 ? `${description.trim()} ${verb}` : verb;
  return next.slice(0, STATEMENT_MAX);
}
