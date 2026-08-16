"use client";

import Link from "next/link";
import {
  ASSESSMENT_FORMATS,
  ASSESSMENT_TYPES,
  SUBMISSION_METHODS,
  rubricScaleSummary,
  type Rubric,
} from "@dse-pms/shared-types";
import { Switch } from "@dse-pms/ui";
import type { CloForm } from "../clo-model";
import { assessmentSltHours, type AssessmentForm } from "../assessment-model";

const DESCRIPTION_MAX = 500;
const INSTRUCTIONS_MAX = 500;
const NOTES_MAX = 500;
const FEEDBACK_METHODS = [
  "Rubric only",
  "Written comments",
  "Rubric + Written Comments",
  "Oral Feedback",
  "Peer Feedback",
];
const FEEDBACK_TIMELINES = [
  "Within 3 days",
  "Within 1 week",
  "Within 2 weeks",
  "After presentation",
  "During class",
];

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
  const selectedRubric = rubrics.find((rubric) => rubric.id === draft.rubricId);
  const missingRubric = draft.rubricId !== "" && !selectedRubric;
  const totalAssessmentSlt = assessmentSltHours(draft);

  const toggleTopic = (topic: number) => {
    const next = draft.topicNumbers.includes(topic)
      ? draft.topicNumbers.filter((value) => value !== topic)
      : [...draft.topicNumbers, topic].sort((a, b) => a - b);
    set({ topicNumbers: next });
  };

  return (
    <div className="space-y-4">
      <Section n={1} title="Assessment Information">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field
            label="Assessment Name"
            required
            error={nameError ? "An assessment name is required." : undefined}
          >
            <input
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              placeholder="e.g. Final Project"
              className={inputCls(nameError)}
            />
          </Field>

          <Field label="Assessment Type" required>
            <select
              value={draft.type}
              onChange={(event) => set({ type: event.target.value })}
              className={selectCls}
            >
              {ASSESSMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Assessment Category" required>
            <select
              value={draft.assessmentCategory}
              onChange={(event) =>
                set({
                  assessmentCategory: event.target
                    .value as AssessmentForm["assessmentCategory"],
                })
              }
              className={selectCls}
            >
              <option value="continuous">Continuous Assessment</option>
              <option value="final">Final Assessment</option>
            </select>
          </Field>

          <Field label="Group / Individual" required>
            <select
              value={draft.mode}
              onChange={(event) =>
                set({ mode: event.target.value as AssessmentForm["mode"] })
              }
              className={selectCls}
            >
              <option value="individual">Individual</option>
              <option value="group">Group</option>
            </select>
          </Field>

          <Field label="Status" required>
            <label className="flex h-9 items-center gap-3 rounded-lg border border-border px-3">
              <Switch
                checked={draft.status === "active"}
                onCheckedChange={(value) =>
                  set({ status: value ? "active" : "inactive" })
                }
              />
              <span className="text-sm text-foreground">
                {draft.status === "active" ? "Active" : "Inactive"}
              </span>
            </label>
          </Field>

          <Field
            label="Assessment Task / Description"
            className="md:col-span-2 xl:col-span-3"
          >
            <textarea
              value={draft.description}
              maxLength={DESCRIPTION_MAX}
              onChange={(event) => set({ description: event.target.value })}
              placeholder="Describe what students are expected to do…"
              className={textareaCls}
            />
            <Counter value={draft.description.length} max={DESCRIPTION_MAX} />
          </Field>
        </div>
      </Section>

      <Section
        n={2}
        title="CLO Evidence Mapping"
        subtitle="Select only the CLOs this assessment directly measures. This mapping is independent from course-grade weighting."
      >
        {clos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            No CLOs are defined yet. Add them on the CLOs tab first.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[48px_84px_minmax(0,1fr)_120px] gap-3 border-b border-border bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">
              <span>Select</span>
              <span>CLO</span>
              <span>CLO Description</span>
              <span>Level</span>
            </div>
            {clos.map((clo) => {
              const selected = draft.cloCodes.includes(clo.code);
              return (
                <label
                  key={clo.id}
                  className="grid cursor-pointer grid-cols-[48px_84px_minmax(0,1fr)_120px] items-start gap-3 border-b border-border px-3 py-3 last:border-b-0 hover:bg-muted/20"
                >
                  <span className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleClo(clo.code)}
                      className="h-4 w-4 rounded border-border"
                    />
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {clo.code}
                  </span>
                  <span className="text-sm leading-5 text-foreground">
                    {clo.description || "No CLO statement provided"}
                  </span>
                  <span className="inline-flex w-fit rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    {clo.level || "—"}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {draft.cloCodes.length === 0
              ? "No CLO evidence mapped. This is valid for grade-only or formative components."
              : `${draft.cloCodes.length} CLO${draft.cloCodes.length === 1 ? "" : "s"} selected: ${draft.cloCodes.join(", ")}`}
          </span>
          <span>
            Related PLOs: {draft.mappedPlos.length ? draft.mappedPlos.join(", ") : "—"}
          </span>
        </div>
      </Section>

      <Section
        n={3}
        title="Course Grading, Topic Coverage & Student Learning Time"
        subtitle="Course-grade policy is separate from CLO evidence. These values feed the official §16 and §17 tables."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Counts toward final course grade">
            <label className="flex h-9 items-center gap-3 rounded-lg border border-border px-3">
              <Switch
                checked={draft.countsTowardGrade}
                onCheckedChange={(value) =>
                  set({
                    countsTowardGrade: value,
                    weight: value ? draft.weight : "",
                  })
                }
              />
              <span className="text-sm text-foreground">
                {draft.countsTowardGrade ? "Graded" : "Formative / non-graded"}
              </span>
            </label>
          </Field>
          <Field
            label="Course Grade Weight (%)"
            required={draft.countsTowardGrade}
            optional={!draft.countsTowardGrade}
          >
            <div className="flex">
              <input
                type="number"
                min={0}
                max={100}
                value={draft.weight}
                disabled={!draft.countsTowardGrade}
                onChange={(event) => set({ weight: event.target.value })}
                placeholder={draft.countsTowardGrade ? "e.g. 25" : "Not graded"}
                className={`${inputCls(false)} rounded-r-none disabled:cursor-not-allowed disabled:opacity-50`}
              />
              <span className="inline-flex h-9 items-center rounded-r-lg border border-l-0 border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                %
              </span>
            </div>
            <Hint>
              Local course grading policy only. This percentage is never reused as a CLO or AUN-QA evidence weight.
            </Hint>
          </Field>
          <Field label="Due Week" optional>
            <select
              value={draft.dueWeek}
              onChange={(event) => set({ dueWeek: event.target.value })}
              className={selectCls}
            >
              <option value="">— Select week —</option>
              {Array.from({ length: 20 }, (_, index) => index + 1).map((week) => (
                <option key={week} value={week}>
                  Week {week}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assessment Duration" optional>
            <div className="flex">
              <input
                type="number"
                min={0}
                value={draft.durationWeeks}
                onChange={(event) => set({ durationWeeks: event.target.value })}
                placeholder="e.g. 2"
                className={`${inputCls(false)} rounded-r-none`}
              />
              <span className="inline-flex h-9 items-center rounded-r-lg border border-l-0 border-border bg-muted/40 px-3 text-sm text-muted-foreground">
                weeks
              </span>
            </div>
          </Field>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-foreground">
            Topics assessed (1–15)
          </p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
            {Array.from({ length: 15 }, (_, index) => index + 1).map((topic) => (
              <label
                key={topic}
                className={`flex cursor-pointer items-center justify-center rounded-md border px-2 py-2 text-xs ${
                  draft.topicNumbers.includes(topic)
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border bg-background"
                }`}
              >
                <input
                  type="checkbox"
                  checked={draft.topicNumbers.includes(topic)}
                  onChange={() => toggleTopic(topic)}
                  className="sr-only"
                />
                {topic}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/15 p-4">
          <p className="text-sm font-semibold text-foreground">
            Assessment Student Learning Time (SLT)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter the official SLT breakdown. Total Assessment SLT is calculated automatically.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <HoursField
              label="Physical / F2F"
              value={draft.physicalSltHours}
              onChange={(value) => set({ physicalSltHours: value })}
            />
            <HoursField
              label="Online / Synchronous"
              value={draft.onlineSltHours}
              onChange={(value) => set({ onlineSltHours: value })}
            />
            <HoursField
              label="Independent / Asynchronous"
              value={draft.independentSltHours}
              onChange={(value) => set({ independentSltHours: value })}
            />
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-foreground">
                Total Assessment SLT
              </span>
              <div className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 text-sm font-semibold tabular-nums">
                {totalAssessmentSlt} h
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-muted-foreground">
          The course-grade weights of active graded assessments should equal 100%. Formative/non-graded assessments are excluded.
        </div>
      </Section>

      <Section n={4} title="Marking & Rubric">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Field label="Rubric">
            <select
              value={draft.rubricId}
              onChange={(event) => set({ rubricId: event.target.value })}
              className={selectCls}
            >
              <option value="">— No rubric —</option>
              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.name} ({rubric.type})
                </option>
              ))}
              {missingRubric ? (
                <option value={draft.rubricId}>
                  Selected rubric (no longer in library)
                </option>
              ) : null}
            </select>
          </Field>
          <div className="flex items-end">
            <Link
              href={`/courses/${courseId}/spec/assessment/rubrics`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              Rubric Library
            </Link>
          </div>
        </div>

        {selectedRubric ? (
          <div className="rounded-lg border border-border bg-muted/15">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                {selectedRubric.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedRubric.criteria.length} criteria · {rubricScaleSummary(selectedRubric.levels)}
              </p>
            </div>
            <div className="divide-y divide-border">
              {selectedRubric.criteria.map((criterion, index) => (
                <div
                  key={criterion.id}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="text-foreground">{criterion.name}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              Criterion-level CLO evidence is not inferred from the rubric. Until criterion-level student scores are stored, CLO evidence is mapped explicitly at assessment level above.
            </div>
          </div>
        ) : (
          <Hint>Select an existing rubric if this assessment uses one.</Hint>
        )}
      </Section>

      <Section n={5} title="Submission & Instructions">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Assessment Format / Deliverables">
            <input
              list="assessment-format-options"
              value={draft.format}
              onChange={(event) => set({ format: event.target.value })}
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
              onChange={(event) => set({ submissionMethod: event.target.value })}
              placeholder="e.g. LMS (Upload)"
              className={inputCls(false)}
            />
            <datalist id="assessment-submission-options">
              {SUBMISSION_METHODS.map((method) => (
                <option key={method} value={method} />
              ))}
            </datalist>
          </Field>
          <Field label="Instructions to Students" className="md:col-span-2">
            <textarea
              value={draft.instructions}
              maxLength={INSTRUCTIONS_MAX}
              onChange={(event) => set({ instructions: event.target.value })}
              placeholder="Guidance for students on how to complete and submit the assessment…"
              className={textareaCls}
            />
            <Counter value={draft.instructions.length} max={INSTRUCTIONS_MAX} />
          </Field>
          <Field label="Notes" optional className="md:col-span-2">
            <textarea
              value={draft.notes}
              maxLength={NOTES_MAX}
              onChange={(event) => set({ notes: event.target.value })}
              placeholder="Internal notes about this assessment…"
              className={textareaCls}
            />
            <Counter value={draft.notes.length} max={NOTES_MAX} />
          </Field>
        </div>
      </Section>

      <Section n={6} title="Feedback">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Feedback Method" required>
            <input
              list="feedback-method-options"
              value={draft.feedbackMethod}
              onChange={(event) => set({ feedbackMethod: event.target.value })}
              placeholder="e.g. Rubric + Written Comments"
              className={inputCls(false)}
            />
            <datalist id="feedback-method-options">
              {FEEDBACK_METHODS.map((method) => (
                <option key={method} value={method} />
              ))}
            </datalist>
            <Hint>How students will receive feedback.</Hint>
          </Field>
          <Field label="Feedback Timeline" optional>
            <input
              list="feedback-timeline-options"
              value={draft.feedbackTimeline}
              onChange={(event) => set({ feedbackTimeline: event.target.value })}
              placeholder="e.g. Within 1 week"
              className={inputCls(false)}
            />
            <datalist id="feedback-timeline-options">
              {FEEDBACK_TIMELINES.map((timeline) => (
                <option key={timeline} value={timeline} />
              ))}
            </datalist>
            <Hint>Expected feedback timing, if known.</Hint>
          </Field>
        </div>
      </Section>
    </div>
  );
}

export function assessmentFormErrors(draft: AssessmentForm) {
  return {
    name: draft.name.trim().length === 0,
    weight:
      draft.countsTowardGrade &&
      (draft.weight === "" || Number(draft.weight) <= 0 || Number(draft.weight) > 100),
  };
}

const inputBase =
  "h-9 w-full rounded-lg border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const inputCls = (error: boolean) =>
  `${inputBase} ${error ? "border-status-live" : "border-border"}`;
const selectCls = `${inputBase} border-border`;
const textareaCls =
  "min-h-[92px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function HoursField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold text-foreground">{label}</span>
      <div className="flex">
        <input
          type="number"
          min={0}
          step="0.5"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          className={`${inputCls(false)} rounded-r-none`}
        />
        <span className="inline-flex h-9 items-center rounded-r-lg border border-l-0 border-border bg-muted/40 px-3 text-xs text-muted-foreground">
          h
        </span>
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  subtitle,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-accent-foreground">
          {n}. {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
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
      <span className="block text-xs font-semibold text-foreground">
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
