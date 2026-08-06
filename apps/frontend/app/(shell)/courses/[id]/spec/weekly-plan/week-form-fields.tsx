"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type {
  LessonLearningOutcome,
  StudentLearningActivity,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import type { CloForm } from "../clos-section";
import { weekSltForm, type WeekForm } from "../weekly-plan-model";
import type { Method } from "@dse-pms/shared-types";

const TOPIC_MAX = 200;

/** The six §18 form sections, shared by the Add Week / Edit Week popup modal. */
export function WeekFormFields({
  draft,
  set,
  toggleClo,
  clos,
  assessmentMethods,
  touched,
  existingAssessments,
  lloRequired = true,
}: {
  draft: WeekForm;
  set: (patch: Partial<WeekForm>) => void;
  toggleClo: (code: string) => void;
  clos: CloForm[];
  assessmentMethods: Method[];
  touched: boolean;
  existingAssessments: string[];
  lloRequired?: boolean;
}) {
  const errors = weekFormErrors(draft, lloRequired);

  const updateLessonLearningOutcomes = (
    lessonLearningOutcomes: LessonLearningOutcome[],
  ) => {
    const validIds = new Set(lessonLearningOutcomes.map((llo) => llo.id));

    /*
     * Keep activity → LLO relationships valid.
     * If an LLO is deleted, remove only that reference from activities.
     * Activities themselves are preserved.
     */
    const studentLearningActivities = draft.studentLearningActivities.map(
      (activity) => ({
        ...activity,
        lloIds: activity.lloIds.filter((id) => validIds.has(id)),
      }),
    );

    set({
      lessonLearningOutcomes,
      studentLearningActivities,
    });
  };
  const availableAssessmentMethodIds = new Set(
    clos
      .filter((clo) => draft.cloCodes.includes(clo.code))
      .flatMap((clo) => clo.assessmentMethodIds),
  );

  const availableAssessmentMethods = assessmentMethods.filter((method) =>
    availableAssessmentMethodIds.has(method.id),
  );

  const toggleAssessmentMethod = (methodId: string) => {
    set({
      assessmentMethodIds: draft.assessmentMethodIds.includes(methodId)
        ? draft.assessmentMethodIds.filter((id) => id !== methodId)
        : [...draft.assessmentMethodIds, methodId],
    });
  };
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
        <p className="text-xs text-muted-foreground">
          Select the CLOs that this week contributes to.
        </p>

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
                    <span className="font-medium text-foreground">
                      {clo.code}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {clo.description || "—"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {touched && errors.clos ? (
          <p className="text-xs text-status-live">Link at least one CLO.</p>
        ) : null}
      </Section>

      {/* 3. Lesson Learning Outcomes */}
      <Section
        n={3}
        title="Lesson Learning Outcomes (LLOs)"
        required={lloRequired}
      >
        <p className="text-xs text-muted-foreground">
          Outcomes students should achieve by the end of this lesson.
          {lloRequired
            ? null
            : " Optional for this legacy week — leave it empty, or fill in any you add."}
        </p>

        <LloEditor
          value={draft.lessonLearningOutcomes}
          onChange={updateLessonLearningOutcomes}
        />

        {touched && errors.llos ? (
          <p className="text-xs text-status-live">
            {lloRequired
              ? "Add at least one LLO (none left blank)."
              : "Remove blank LLOs, or leave the list empty."}
          </p>
        ) : null}
      </Section>

      {/* 4. Student Learning Activities */}
      <Section n={4} title="Student Activities (What students do)" required>
        <p className="text-xs text-muted-foreground">
          Describe the activities students will perform to achieve this week's
          LLOs.
        </p>

        <StudentLearningActivitiesEditor
          value={draft.studentLearningActivities}
          lessonLearningOutcomes={draft.lessonLearningOutcomes}
          onChange={(studentLearningActivities) =>
            set({ studentLearningActivities })
          }
        />

        {touched && errors.activities ? (
          <p className="text-xs text-status-live">
            Add at least one student learning activity.
          </p>
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
          <Field label="Independent Learning Hours (NF2F)">
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
      <Section n={6} title="Assessment">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Assessment Method(s)
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Select the assessment methods used this week. Available methods
              are based on the CLOs linked to this week.
            </p>
          </div>

          {draft.cloCodes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              Link at least one CLO to see available assessment methods.
            </div>
          ) : availableAssessmentMethods.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
              The linked CLOs do not have assessment methods assigned yet.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {availableAssessmentMethods.map((method) => {
                const selected = draft.assessmentMethodIds.includes(method.id);

                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => toggleAssessmentMethod(method.id)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                      selected
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {selected ? "✓" : ""}
                    </span>

                    <span className="font-medium">{method.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

/**
 * Validation shared between the fields above and the modal that hosts them.
 *
 * New weeks use lessonLearningOutcomes as the source of truth.
 * Legacy activities remain accepted until old CourseSpec data is migrated.
 */
export function weekFormErrors(draft: WeekForm, lloRequired = true) {
  const hasBlankLlo = draft.lessonLearningOutcomes.some(
    (llo) => !llo.description.trim(),
  );

  return {
    topic: draft.topic.trim().length === 0,

    clos: draft.cloCodes.length === 0,

    llos: lloRequired
      ? draft.lessonLearningOutcomes.length === 0 || hasBlankLlo
      : hasBlankLlo,

    activities:
      draft.studentLearningActivities.length === 0 &&
      draft.activities.length === 0,
  };
}

/**
 * Ordered editable list of Lesson Learning Outcomes.
 *
 * IDs are stable. LLO1/LLO2/... are display labels derived from the
 * current order only.
 */
function LloEditor({
  value,
  onChange,
}: {
  value: LessonLearningOutcome[];
  onChange: (value: LessonLearningOutcome[]) => void;
}) {
  const add = () => {
    onChange([
      ...value,
      {
        id: crypto.randomUUID(),
        description: "",
      },
    ]);
  };

  const update = (id: string, description: string) => {
    onChange(
      value.map((llo) =>
        llo.id === id
          ? {
              ...llo,
              description,
            }
          : llo,
      ),
    );
  };

  const remove = (id: string) => {
    onChange(value.filter((llo) => llo.id !== id));
  };

  return (
    <div className="space-y-2">
      {value.map((llo, index) => (
        <div key={llo.id} className="flex items-start gap-2">
          <span className="mt-2.5 w-12 shrink-0 text-xs font-medium text-muted-foreground">
            LLO{index + 1}
          </span>

          <input
            type="text"
            value={llo.description}
            onChange={(e) => update(llo.id, e.target.value)}
            placeholder="Describe what students should achieve..."
            className={inputCls}
          />

          <button
            type="button"
            onClick={() => remove(llo.id)}
            aria-label={`Delete LLO${index + 1}`}
            title="Delete"
            className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-status-live/10 hover:text-status-live"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add LLO
      </Button>
    </div>
  );
}

/**
 * Structured student learning activities.
 *
 * activity.lloIds contains stable LessonLearningOutcome IDs, never
 * display labels such as "LLO1".
 */
function StudentLearningActivitiesEditor({
  value,
  lessonLearningOutcomes,
  onChange,
}: {
  value: StudentLearningActivity[];
  lessonLearningOutcomes: LessonLearningOutcome[];
  onChange: (value: StudentLearningActivity[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const editing = editingId
    ? (value.find((activity) => activity.id === editingId) ?? null)
    : null;

  const remove = (id: string) => {
    onChange(value.filter((activity) => activity.id !== id));

    if (editingId === id) {
      setEditingId(null);
    }
  };

  const save = (activity: StudentLearningActivity) => {
    if (editingId) {
      onChange(value.map((item) => (item.id === editingId ? activity : item)));

      setEditingId(null);
      return;
    }

    onChange([...value, activity]);
    setAdding(false);
  };

  const displayLloCode = (lloId: string) => {
    const index = lessonLearningOutcomes.findIndex((llo) => llo.id === lloId);

    return index >= 0 ? `LLO${index + 1}` : null;
  };

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-sm font-medium text-foreground">
            No student activities added yet.
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Add activities that describe what students will do during this
            week's learning.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {value.map((activity) => {
            const linkedLlos = activity.lloIds
              .map((lloId) => ({
                id: lloId,
                code: displayLloCode(lloId),
              }))
              .filter(
                (
                  item,
                ): item is {
                  id: string;
                  code: string;
                } => item.code !== null,
              );

            return (
              <li
                key={activity.id}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {activity.title}
                    </p>

                    {activity.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {activity.description}
                      </p>
                    ) : null}

                    {linkedLlos.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          Supports:
                        </span>

                        {linkedLlos.map((llo) => (
                          <span
                            key={llo.id}
                            className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                          >
                            {llo.code}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        setEditingId(activity.id);
                      }}
                      aria-label={`Edit ${activity.title}`}
                      title="Edit"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => remove(activity.id)}
                      aria-label={`Delete ${activity.title}`}
                      title="Delete"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-status-live/10 hover:text-status-live"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {adding || editing ? (
        <StudentLearningActivityForm
          key={editing?.id ?? "new-activity"}
          initialValue={editing}
          lessonLearningOutcomes={lessonLearningOutcomes}
          onCancel={() => {
            setAdding(false);
            setEditingId(null);
          }}
          onSave={save}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add Activity
        </Button>
      )}
    </div>
  );
}

function StudentLearningActivityForm({
  initialValue,
  lessonLearningOutcomes,
  onCancel,
  onSave,
}: {
  initialValue: StudentLearningActivity | null;
  lessonLearningOutcomes: LessonLearningOutcome[];
  onCancel: () => void;
  onSave: (activity: StudentLearningActivity) => void;
}) {
  const [title, setTitle] = useState(initialValue?.title ?? "");

  const [description, setDescription] = useState(
    initialValue?.description ?? "",
  );

  const [lloIds, setLloIds] = useState<string[]>(initialValue?.lloIds ?? []);

  const [touched, setTouched] = useState(false);

  const toggleLlo = (lloId: string) => {
    setLloIds((current) =>
      current.includes(lloId)
        ? current.filter((id) => id !== lloId)
        : [...current, lloId],
    );
  };

  const submit = () => {
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setTouched(true);
      return;
    }

    /*
     * Only persist references to LLOs that still exist.
     * This also protects an open activity editor if an LLO was
     * removed elsewhere before the activity was saved.
     */
    const validLloIds = new Set(lessonLearningOutcomes.map((llo) => llo.id));

    onSave({
      id: initialValue?.id ?? crypto.randomUUID(),
      title: cleanTitle,
      description: description.trim(),
      lloIds: lloIds.filter((id) => validLloIds.has(id)),
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
      <Field label="Activity Title" required>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Soil Data Collection Exercise"
          className={`${inputCls} ${
            touched && !title.trim() ? "border-status-live" : ""
          }`}
        />

        {touched && !title.trim() ? (
          <p className="text-xs text-status-live">
            Activity title is required.
          </p>
        ) : null}
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe what students will do during this activity."
          className="min-h-[80px] w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </Field>

      <Field label="Supports LLO(s)">
        {lessonLearningOutcomes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            Add Lesson Learning Outcomes first to link this activity.
          </p>
        ) : (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            {lessonLearningOutcomes.map((llo, index) => (
              <label
                key={llo.id}
                className="flex cursor-pointer items-start gap-2.5"
              >
                <input
                  type="checkbox"
                  checked={lloIds.includes(llo.id)}
                  onChange={() => toggleLlo(llo.id)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />

                <span className="text-sm">
                  <span className="font-medium text-foreground">
                    LLO{index + 1}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {llo.description || "—"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </Field>

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>

        <Button type="button" size="sm" onClick={submit}>
          {initialValue ? "Save Changes" : "Add Activity"}
        </Button>
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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
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
