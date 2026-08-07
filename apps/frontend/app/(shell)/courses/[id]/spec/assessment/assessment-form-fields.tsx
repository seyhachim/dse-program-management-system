"use client";

import Link from "next/link";
import {
  AFFECTIVE_LEVELS,
  ASSESSMENT_FORMATS,
  ASSESSMENT_TYPES,
  COGNITIVE_LEVELS,
  PSYCHOMOTOR_LEVELS,
  SUBMISSION_METHODS,
  type Rubric,
} from "@dse-pms/shared-types";
import { Switch } from "@dse-pms/ui";
import type { CloForm } from "../clo-model";
import type { AssessmentForm } from "../assessment-model";

const DESCRIPTION_MAX = 500;
const INSTRUCTIONS_MAX = 500;
const NOTES_MAX = 500;

/**
 * Assessment form.
 *
 * Academic alignment ownership:
 *
 *   Assessment → CLO       manually selected here
 *   CLO → PLO              defined in the CLO section
 *   Assessment → PLO       derived automatically
 *
 * mappedPlos remains in AssessmentForm for compatibility with the existing
 * CourseSpec document, but it is not manually editable here.
 */
export function AssessmentFormFields({
  draft,
  set,
  toggleClo,
  clos,
  rubrics,
  courseId,
  touched,
}: {
  draft: AssessmentForm;
  set: (patch: Partial<AssessmentForm>) => void;
  toggleClo: (code: string) => void;
  clos: CloForm[];
  rubrics: Rubric[];
  courseId: string;
  touched: boolean;
}) {
  const nameError = touched && draft.name.trim().length === 0;

  /*
   * A previously-saved rubric whose row has since been deleted:
   * keep it selectable so editing an assessment doesn't silently
   * drop the existing reference.
   */
  const missingRubric =
    draft.rubric !== "" &&
    !rubrics.some((rubric) => rubric.id === draft.rubric);

  const selectedClos = clos.filter((clo) => draft.cloCodes.includes(clo.code));

  return (
    <div className="space-y-8">
      {/* 1. Assessment Information */}
      <Section n={1} title="Assessment Information">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field
            label="Assessment Name"
            required
            error={nameError ? "An assessment name is required." : undefined}
          >
            <input
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Assignment 1"
              className={inputCls(nameError)}
            />
          </Field>

          <Field label="Type" required>
            <select
              value={draft.type}
              onChange={(e) => set({ type: e.target.value })}
              className={selectCls}
            >
              {ASSESSMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Description" className="md:col-span-2">
            <textarea
              value={draft.description}
              maxLength={DESCRIPTION_MAX}
              onChange={(e) =>
                set({
                  description: e.target.value,
                })
              }
              placeholder="Describe what this assessment involves…"
              className="min-h-[88px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />

            <Counter value={draft.description.length} max={DESCRIPTION_MAX} />
          </Field>

          <Field label="Assessment Method" required>
            <select
              value={draft.mode}
              onChange={(e) =>
                set({
                  mode: e.target.value as AssessmentForm["mode"],
                })
              }
              className={selectCls}
            >
              <option value="individual">Individual</option>

              <option value="group">Group</option>
            </select>
          </Field>

          <Field label="Status" required>
            <label className="flex h-9 items-center gap-3">
              <Switch
                checked={draft.status === "active"}
                onCheckedChange={(value) =>
                  set({
                    status: value ? "active" : "inactive",
                  })
                }
              />

              <span className="text-sm text-foreground">
                {draft.status === "active" ? "Active" : "Inactive"}
              </span>
            </label>

            <Hint>
              Inactive assessments are excluded from the weighting total and CLO
              coverage.
            </Hint>
          </Field>
        </div>
      </Section>

      {/* 2. CLO Alignment */}
      <Section n={2} title="CLO Alignment">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Assessed CLOs" required>
            {clos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                No CLOs defined yet. Add them on the CLOs tab first.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-2.5">
                  {clos.map((clo) => {
                    const on = draft.cloCodes.includes(clo.code);

                    return (
                      <button
                        key={clo.code}
                        type="button"
                        onClick={() => toggleClo(clo.code)}
                        title={clo.description}
                        className={chipToggleCls(on)}
                      >
                        {clo.code}
                      </button>
                    );
                  })}
                </div>

                {selectedClos.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedClos.map((clo) => (
                      <div
                        key={clo.id}
                        className="rounded-lg bg-muted/40 px-3 py-2"
                      >
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 text-xs font-semibold text-foreground">
                            {clo.code}
                          </span>

                          <p className="text-xs leading-5 text-muted-foreground">
                            {clo.description || "No CLO statement provided"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            <Hint>Select the CLOs that this assessment directly measures.</Hint>
          </Field>

          <Field label="Bloom's Level (Target)">
            <select
              value={draft.bloomLevel}
              onChange={(e) =>
                set({
                  bloomLevel: e.target.value,
                })
              }
              className={selectCls}
            >
              <option value="">— Select level —</option>

              <optgroup label="Cognitive">
                {COGNITIVE_LEVELS.map((level) => (
                  <option key={level.code} value={level.code}>
                    {level.code} — {level.name}
                  </option>
                ))}
              </optgroup>

              <optgroup label="Affective">
                {AFFECTIVE_LEVELS.map((level) => (
                  <option key={level.code} value={level.code}>
                    {level.code} — {level.name}
                  </option>
                ))}
              </optgroup>

              <optgroup label="Psychomotor">
                {PSYCHOMOTOR_LEVELS.map((level) => (
                  <option key={level.code} value={level.code}>
                    {level.code} — {level.name}
                  </option>
                ))}
              </optgroup>
            </select>

            <Hint>
              Target cognitive, affective, or psychomotor level assessed by this
              activity.
            </Hint>
          </Field>
        </div>
      </Section>

      {/* 3. Weighting & Scheduling */}
      <Section n={3} title="Weighting & Scheduling">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <Field label="Weight (%)" required>
            <div className="flex">
              <input
                type="number"
                min={0}
                max={100}
                value={draft.weight}
                onChange={(e) =>
                  set({
                    weight: e.target.value,
                  })
                }
                placeholder="e.g. 10"
                className={`${inputCls(false)} rounded-r-none`}
              />

              <span className="inline-flex h-9 items-center rounded-r-lg border border-l-0 border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                %
              </span>
            </div>

            <Hint>Active assessment weights should total 100%.</Hint>
          </Field>

          <Field label="Due Week" required>
            <select
              value={draft.dueWeek}
              onChange={(e) =>
                set({
                  dueWeek: e.target.value,
                })
              }
              className={selectCls}
            >
              <option value="">— Select week —</option>

              {Array.from({ length: 20 }, (_, index) => index + 1).map(
                (week) => (
                  <option key={week} value={week}>
                    Week {week}
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field label="Assessment Duration" optional>
            <div className="flex">
              <input
                type="number"
                min={0}
                value={draft.durationWeeks}
                onChange={(e) =>
                  set({
                    durationWeeks: e.target.value,
                  })
                }
                placeholder="e.g. 1"
                className={`${inputCls(false)} rounded-r-none`}
              />

              <span className="inline-flex h-9 items-center rounded-r-lg border border-l-0 border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                weeks
              </span>
            </div>

            <Hint>Estimated time for students to complete.</Hint>
          </Field>
        </div>
      </Section>

      {/* 4. Assessment Details */}
      <Section n={4} title="Assessment Details">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Assessment Format / Deliverables">
            <input
              list="assessment-format-options"
              value={draft.format}
              onChange={(e) =>
                set({
                  format: e.target.value,
                })
              }
              placeholder="e.g. Written Report"
              className={inputCls(false)}
            />

            <datalist id="assessment-format-options">
              {ASSESSMENT_FORMATS.map((format) => (
                <option key={format} value={format} />
              ))}
            </datalist>
          </Field>

          <Field label="Submission Method">
            <input
              list="assessment-submission-options"
              value={draft.submissionMethod}
              onChange={(e) =>
                set({
                  submissionMethod: e.target.value,
                })
              }
              placeholder="e.g. LMS (Upload)"
              className={inputCls(false)}
            />

            <datalist id="assessment-submission-options">
              {SUBMISSION_METHODS.map((method) => (
                <option key={method} value={method} />
              ))}
            </datalist>
          </Field>

          <Field label="Instructions to Students">
            <textarea
              value={draft.instructions}
              maxLength={INSTRUCTIONS_MAX}
              onChange={(e) =>
                set({
                  instructions: e.target.value,
                })
              }
              placeholder="Guidance for students on how to complete and submit…"
              className="min-h-[88px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />

            <Counter value={draft.instructions.length} max={INSTRUCTIONS_MAX} />
          </Field>

          <Field label="Rubric">
            <select
              value={draft.rubric}
              onChange={(e) =>
                set({
                  rubric: e.target.value,
                })
              }
              className={selectCls}
            >
              <option value="">— No rubric —</option>

              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.name} ({rubric.type})
                </option>
              ))}

              {missingRubric ? (
                <option value={draft.rubric}>
                  Selected rubric (no longer in library)
                </option>
              ) : null}
            </select>

            <Hint>
              Choose a rubric from the{" "}
              <Link
                href={`/courses/${courseId}/spec/assessment/rubrics`}
                className="font-medium text-accent-foreground hover:underline"
              >
                Rubric Library
              </Link>
              {rubrics.length === 0 ? (
                <>
                  {" "}
                  —{" "}
                  <Link
                    href={`/courses/${courseId}/spec/assessment/rubrics/new`}
                    className="font-medium text-accent-foreground hover:underline"
                  >
                    create one
                  </Link>{" "}
                  first.
                </>
              ) : (
                " used to grade this assessment."
              )}
            </Hint>
          </Field>
        </div>
      </Section>

      {/* 5. Alignment Context */}
      <Section n={5} title="Alignment Context">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field label="Derived PLO Alignment">
            {draft.cloCodes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4">
                <p className="text-sm text-muted-foreground">
                  Select at least one CLO to see the related PLO alignment.
                </p>
              </div>
            ) : draft.mappedPlos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4">
                <p className="text-sm text-muted-foreground">
                  The selected CLOs do not currently have any PLO mappings.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {draft.mappedPlos.map((ploCode) => (
                    <span
                      key={ploCode}
                      className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-semibold text-foreground"
                    >
                      {ploCode}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Hint>
              Read-only. PLO alignment is derived automatically from the
              selected CLOs.
            </Hint>
          </Field>

          <Field label="Notes" optional>
            <textarea
              value={draft.notes}
              maxLength={NOTES_MAX}
              onChange={(e) =>
                set({
                  notes: e.target.value,
                })
              }
              placeholder="Add any notes about this assessment…"
              className="min-h-[88px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />

            <Counter value={draft.notes.length} max={NOTES_MAX} />
          </Field>
        </div>
      </Section>
    </div>
  );
}

/**
 * Validation shared between the fields above and the page that hosts them.
 */
export function assessmentFormErrors(draft: AssessmentForm) {
  return {
    name: draft.name.trim().length === 0,
  };
}

/* ---------------------------------------------------------------- shared */

const inputBase =
  "h-9 w-full rounded-lg border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const inputCls = (error: boolean) =>
  `${inputBase} ${error ? "border-status-live" : "border-border"}`;

const selectCls = `${inputBase} border-border`;

const chipToggleCls = (on: boolean) =>
  `inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition-colors ${
    on
      ? "bg-accent text-accent-foreground"
      : "border border-border bg-card text-muted-foreground hover:bg-muted"
  }`;

function Section({
  n,
  title,
  optional,
  children,
}: {
  n: number;
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-foreground">
        {n}. {title}
        {optional ? (
          <span className="font-normal text-muted-foreground"> (Optional)</span>
        ) : null}
      </h4>

      {children}
    </div>
  );
}

function Field({
  label,
  required,
  optional,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <span className="block text-sm font-medium text-foreground">
        {label}

        {required ? <span className="text-status-live"> *</span> : null}

        {optional ? (
          <span className="font-normal text-muted-foreground"> (Optional)</span>
        ) : null}
      </span>

      {children}

      {error ? <p className="text-xs text-status-live">{error}</p> : null}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function Counter({ value, max }: { value: number; max: number }) {
  return (
    <div className="flex justify-end">
      <span className="text-xs text-muted-foreground">
        {value} / {max}
      </span>
    </div>
  );
}
