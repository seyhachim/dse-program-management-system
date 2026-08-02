"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { LEARNING_ACTIVITIES } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import type { CloForm } from "../clos-section";
import { weekSltForm, type WeekForm } from "../weekly-plan-model";

const TOPIC_MAX = 200;

/** The six §18 form sections, shared by the Add Week / Edit Week popup modal. */
export function WeekFormFields({
  draft,
  set,
  toggleClo,
  clos,
  touched,
  existingAssessments,
  lloRequired = true,
}: {
  draft: WeekForm;
  set: (patch: Partial<WeekForm>) => void;
  toggleClo: (code: string) => void;
  clos: CloForm[];
  touched: boolean;
  existingAssessments: string[];
  /** False for a legacy week that already existed with zero LLOs — lets it be saved without adding any. */
  lloRequired?: boolean;
}) {
  const errors = weekFormErrors(draft, lloRequired);

  return (
    <div className="space-y-6">
      {/* 1. Week Information */}
      <Section n={1} title="Week Information">
        <Field label="Week No." required>
          <input
            type="number"
            min={1}
            max={52}
            value={draft.week}
            onChange={(e) => set({ week: e.target.value })}
            className={inputCls}
          />
          <Hint>Enter week number (e.g. 1, 2, 3…)</Hint>
        </Field>

        <Field label="Topic / Content" required>
          <textarea
            value={draft.topic}
            maxLength={TOPIC_MAX}
            onChange={(e) => set({ topic: e.target.value })}
            placeholder="Enter topic or content for this week"
            className={`min-h-[80px] w-full rounded-lg border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              touched && errors.topic ? "border-status-live" : "border-border"
            }`}
          />
          <div className="flex items-center justify-between">
            {touched && errors.topic ? (
              <p className="text-xs text-status-live">A topic is required.</p>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted-foreground">
              {draft.topic.length} / {TOPIC_MAX}
            </span>
          </div>
        </Field>
      </Section>

      {/* 2. Link CLOs */}
      <Section n={2} title="Link CLOs" required>
        <p className="text-xs text-muted-foreground">Select the CLOs that this week contributes to.</p>
        {clos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            No CLOs defined yet. Add them on the CLOs tab first.
          </p>
        ) : (
          <ul className="space-y-2 rounded-lg border border-border p-3">
            {clos.map((clo) => (
              <li key={clo.code}>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    checked={draft.cloCodes.includes(clo.code)}
                    onChange={() => toggleClo(clo.code)}
                  />
                  <span>
                    <span className="font-medium text-foreground">{clo.code}</span>{" "}
                    <span className="text-muted-foreground">{clo.description || "—"}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {touched && errors.clos ? <p className="text-xs text-status-live">Link at least one CLO.</p> : null}
      </Section>

      {/* 3. Lesson Learning Outcomes (LLOs) */}
      <Section n={3} title="Lesson Learning Outcomes (LLOs)" required={lloRequired}>
        <p className="text-xs text-muted-foreground">
          Outcomes students should achieve by the end of this lesson.
          {lloRequired ? null : " Optional for this legacy week — leave it empty, or fill in any you add."}
        </p>
        <LloEditor value={draft.lloItems} onChange={(lloItems) => set({ lloItems })} />
        {touched && errors.llos ? (
          <p className="text-xs text-status-live">
            {lloRequired ? "Add at least one LLO (none left blank)." : "Remove blank LLOs, or leave the list empty."}
          </p>
        ) : null}
      </Section>

      {/* 4. Learning Activities */}
      <Section n={4} title="Learning Activities" required>
        <ActivityPicker value={draft.activities} onChange={(activities) => set({ activities })} />
        {touched && errors.activities ? (
          <p className="text-xs text-status-live">Add at least one learning activity.</p>
        ) : null}
      </Section>

      {/* 5. Time Allocation */}
      <Section n={5} title="Time Allocation (Hours)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Lecture (L)">
            <input
              type="number"
              min={0}
              value={draft.lectureHours}
              onChange={(e) => set({ lectureHours: e.target.value })}
              placeholder="e.g. 2"
              className={inputCls}
            />
          </Field>
          <Field label="Tutorial (T)">
            <input
              type="number"
              min={0}
              value={draft.tutorialHours}
              onChange={(e) => set({ tutorialHours: e.target.value })}
              placeholder="e.g. 1"
              className={inputCls}
            />
          </Field>
          <Field label="Practice (P)">
            <input
              type="number"
              min={0}
              value={draft.practiceHours}
              onChange={(e) => set({ practiceHours: e.target.value })}
              placeholder="e.g. 1"
              className={inputCls}
            />
          </Field>
          <Field label="Other (O)">
            <input
              type="number"
              min={0}
              value={draft.otherHours}
              onChange={(e) => set({ otherHours: e.target.value })}
              placeholder="e.g. 0"
              className={inputCls}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Self-Study Hours">
            <input
              type="number"
              min={0}
              value={draft.selfStudyHours}
              onChange={(e) => set({ selfStudyHours: e.target.value })}
              placeholder="e.g. 3"
              className={inputCls}
            />
          </Field>
          <Field label="SLT (Hours)">
            <div className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm font-medium text-foreground">
              {weekSltForm(draft)}
            </div>
            <Hint>Auto-calculated</Hint>
          </Field>
        </div>
      </Section>

      {/* 6. Assessment / Deliverables */}
      <Section n={6} title="Assessment / Deliverables">
        <input
          list="week-assessment-options"
          value={draft.assessment}
          onChange={(e) => set({ assessment: e.target.value })}
          placeholder="e.g. Lab 1, EDA Report…"
          className={inputCls}
        />
        <datalist id="week-assessment-options">
          {existingAssessments.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
      </Section>
    </div>
  );
}

/**
 * Validation shared between the fields above and the page that hosts them. LLOs are
 * required for a new/already-LLO'd week, but optional for a legacy week that existed
 * with zero LLOs before this field shipped — see `lloRequired` in `WeekFormModal`.
 * Either way, any LLO row that's present can't be left blank.
 */
export function weekFormErrors(draft: WeekForm, lloRequired = true) {
  return {
    topic: draft.topic.trim().length === 0,
    clos: draft.cloCodes.length === 0,
    llos: lloRequired
      ? draft.lloItems.length === 0 || draft.lloItems.some((l) => !l.trim())
      : draft.lloItems.some((l) => !l.trim()),
    activities: draft.activities.length === 0,
  };
}

/** Ordered, editable list of Lesson Learning Outcomes: LLO1, LLO2… by position, add/delete. */
function LloEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const setAt = (i: number, text: string) => onChange(value.map((v, idx) => (idx === i ? text : v)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, ""]);

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          No LLOs added yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((llo, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 px-2 text-xs font-semibold text-muted-foreground">
                LLO{i + 1}
              </span>
              <input
                type="text"
                value={llo}
                onChange={(e) => setAt(i, e.target.value)}
                placeholder="e.g. Explain the machine learning workflow."
                className={`${inputCls} flex-1`}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Delete LLO${i + 1}`}
                title="Delete"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-status-live/40 hover:text-status-live"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add LLO
      </Button>
    </div>
  );
}

/**
 * Chip-based multi-select for learning activities: search + click-to-add preset
 * suggestions, plus free-text entries not in the list. Mirrors the look/feel of
 * `ChipMultiSelect` (the CLO wizard's teaching/assessment method picker), adapted
 * for a plain string list rather than id-backed `Method` records.
 */
function ActivityPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [query, setQuery] = useState("");

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LEARNING_ACTIVITIES.filter(
      (a) => !value.some((v) => v.toLowerCase() === a.toLowerCase()) && (!q || a.toLowerCase().includes(q)),
    );
  }, [value, query]);

  const trimmedQuery = query.trim();
  const isNewEntry =
    trimmedQuery.length > 0 &&
    !value.some((v) => v.toLowerCase() === trimmedQuery.toLowerCase()) &&
    !LEARNING_ACTIVITIES.some((a) => a.toLowerCase() === trimmedQuery.toLowerCase());

  const add = (raw: string) => {
    const name = raw.trim();
    if (!name || value.some((v) => v.toLowerCase() === name.toLowerCase())) return;
    onChange([...value, name]);
    setQuery("");
  };
  const remove = (name: string) => onChange(value.filter((v) => v !== name));

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-foreground">
        Activities <span className="text-muted-foreground">({value.length})</span>
      </span>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((a) => (
            <li key={a}>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 py-1 pl-3 pr-1.5 text-sm text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                {a}
                <button
                  type="button"
                  aria-label={`Remove ${a}`}
                  onClick={() => remove(a)}
                  className="cursor-pointer rounded-full p-0.5 hover:bg-violet-100 dark:hover:bg-violet-950/60"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(query);
              }
            }}
            placeholder="Search or add an activity…"
            className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {isNewEntry ? (
            <li>
              <button
                type="button"
                onClick={() => add(trimmedQuery)}
                className="cursor-pointer rounded-full border border-dashed border-accent px-3 py-1 text-sm text-accent-foreground transition-colors hover:border-solid hover:bg-accent/10"
              >
                <Plus className="mr-1 inline h-3 w-3" />
                Add “{trimmedQuery}”
              </button>
            </li>
          ) : null}
          {suggestions.length === 0 && !isNewEntry ? (
            <li className="text-xs text-muted-foreground">
              {value.length === LEARNING_ACTIVITIES.length ? "All suggested activities selected." : "No matches."}
            </li>
          ) : (
            suggestions.map((a) => (
              <li key={a}>
                <button
                  type="button"
                  onClick={() => add(a)}
                  className="cursor-pointer rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-solid hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 dark:hover:border-violet-700/60 dark:hover:bg-violet-950/30 dark:hover:text-violet-300"
                >
                  + {a}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function Section({
  n,
  title,
  required,
  children,
}: {
  n: number;
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-foreground">
        {n}. {title}
        {required ? <span className="text-status-live"> *</span> : null}
      </h4>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-status-live"> *</span> : null}
      </span>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
