"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { Method } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import {
  teachingLearningApi,
  type WeekProjectProgress,
} from "@/lib/teaching-learning";
import {
  CourseSpecAuthoringHeader,
  CourseSpecAuthoringStack,
  CourseSpecEmptyState,
  CourseSpecNotice,
} from "./authoring-section-ui";
import { ChipMultiSelect } from "./clos/chip-multiselect";
import { withCodes, type CloForm } from "./clo-model";
import {
  MAX_INSTRUCTIONAL_WEEKS,
  emptyWeek,
  instructionalWeeklyPlan,
  mergeInstructionalWeeklyPlan,
  weekSltForm,
  type WeekForm,
  type WeeklyPlanForm,
} from "./weekly-plan-model";

const uuid = () => globalThis.crypto.randomUUID();

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function initialExpectedLearning(week: WeekForm): string {
  const structured = week.lessonLearningOutcomes
    .map((item) => item.description.trim())
    .filter(Boolean);
  return (structured.length > 0 ? structured : week.lloItems).join("\n");
}

function initialStudentActivities(week: WeekForm): string {
  const structured = week.studentLearningActivities
    .map((item) => item.title.trim())
    .filter(Boolean);
  return (structured.length > 0 ? structured : week.activities).join("\n");
}

type MilestoneEditorState = {
  week: WeekForm;
  expectedLearning: string;
  studentActivities: string;
  expectedProgress: string;
  deliverable: string;
  progressStatus: WeekProjectProgress["status"];
};

export function FinalProjectMilestoneSection({
  value,
  onPersist,
  courseId,
  ready,
  clos,
  teachingMethods,
}: {
  value: WeeklyPlanForm;
  onPersist: (items: WeeklyPlanForm) => Promise<boolean>;
  courseId: string;
  ready: boolean;
  clos: CloForm[];
  teachingMethods: Method[];
}) {
  const milestones = useMemo(() => instructionalWeeklyPlan(value), [value]);
  const activeClos = useMemo(
    () => withCodes(clos).filter((clo) => clo.status === "active"),
    [clos],
  );
  const [editor, setEditor] = useState<MilestoneEditorState | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const totalSlt = milestones.reduce((sum, week) => sum + weekSltForm(week), 0);

  const openEditor = async (week: WeekForm) => {
    setLoadingEditor(true);
    setError(null);
    try {
      const progress = await teachingLearningApi.getWeekProjectProgress(
        courseId,
        week.id,
      );
      setEditor({
        week: { ...week },
        expectedLearning: initialExpectedLearning(week),
        studentActivities: initialStudentActivities(week),
        expectedProgress: progress.expectedProgress,
        deliverable: progress.deliverable,
        progressStatus: progress.status,
      });
    } catch {
      setEditor({
        week: { ...week },
        expectedLearning: initialExpectedLearning(week),
        studentActivities: initialStudentActivities(week),
        expectedProgress: "",
        deliverable: "",
        progressStatus: "planned",
      });
    } finally {
      setLoadingEditor(false);
    }
  };

  const addMilestone = () => {
    if (milestones.length >= MAX_INSTRUCTIONAL_WEEKS) return;
    const week = emptyWeek(value);
    setEditor({
      week,
      expectedLearning: "",
      studentActivities: "",
      expectedProgress: "",
      deliverable: "",
      progressStatus: "planned",
    });
  };

  const patchWeek = (patch: Partial<WeekForm>) => {
    setEditor((current) =>
      current
        ? { ...current, week: { ...current.week, ...patch } }
        : current,
    );
  };

  const saveMilestone = async () => {
    if (!editor) return;
    const expectedLearning = lines(editor.expectedLearning);
    const studentActivities = lines(editor.studentActivities);
    const lessonLearningOutcomes = expectedLearning.map((description, index) => ({
      id: editor.week.lessonLearningOutcomes[index]?.id ?? uuid(),
      description,
    }));
    const validLloIds = new Set(
      lessonLearningOutcomes.map((outcome) => outcome.id),
    );
    const studentLearningActivities = studentActivities.map((title, index) => {
      const existing = editor.week.studentLearningActivities[index];
      return {
        id: existing?.id ?? uuid(),
        title,
        description: existing?.description ?? "",
        lloIds: (existing?.lloIds ?? []).filter((id) => validLloIds.has(id)),
      };
    });
    const week: WeekForm = {
      ...editor.week,
      topic: editor.week.topic.trim(),
      lessonLearningOutcomes,
      lloItems: expectedLearning,
      studentLearningActivities,
      activities: studentActivities,
      lectureHours: "",
      tutorialHours: "",
      practiceHours: "",
    };

    const current = instructionalWeeklyPlan(value);
    const existingIndex = current.findIndex((item) => item.id === week.id);
    const nextInstructional =
      existingIndex >= 0
        ? current.map((item) => (item.id === week.id ? week : item))
        : [...current, week];
    const next = mergeInstructionalWeeklyPlan(value, nextInstructional);

    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      if (!(await onPersist(next))) {
        setError("Milestone Plan could not be saved.");
        return;
      }
      await teachingLearningApi.saveWeekProjectProgress(courseId, week.id, {
        milestone: week.topic,
        expectedProgress: editor.expectedProgress.trim(),
        deliverable: editor.deliverable.trim(),
        status: editor.progressStatus,
      });
      setEditor(null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      setError(
        "The milestone was partly saved, but project-progress details could not be confirmed. Please open it and save again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteMilestone = async (weekId: string) => {
    const nextInstructional = milestones.filter((week) => week.id !== weekId);
    const next = mergeInstructionalWeeklyPlan(value, nextInstructional);
    setSaving(true);
    setError(null);
    try {
      if (!(await onPersist(next))) {
        setError("Milestone could not be removed.");
      }
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <CourseSpecAuthoringHeader
      title="Milestone Plan"
      description="Plan expected project progress across the semester. These are project stages and supervision checkpoints, not weekly lecture topics."
      ready={ready}
      feedback={
        saving
          ? { state: "saving", label: "Saving…" }
          : saved
            ? { state: "saved", label: "Saved" }
            : error
              ? { state: "error", label: "Save failed" }
              : undefined
      }
      meta={
        <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {milestones.length}/{MAX_INSTRUCTIONAL_WEEKS} project weeks · {totalSlt} SLT h
        </span>
      }
      actions={
        <Button
          size="sm"
          onClick={addMilestone}
          disabled={
            saving || loadingEditor || milestones.length >= MAX_INSTRUCTIONAL_WEEKS
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add milestone
        </Button>
      }
    />
  );

  return (
    <CourseSpecAuthoringStack className="pb-6">
      {header}

      {error ? <CourseSpecNotice tone="error">{error}</CourseSpecNotice> : null}

      {loadingEditor ? (
        <CourseSpecNotice>
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading milestone…
          </span>
        </CourseSpecNotice>
      ) : null}

      {editor ? (
        <section className="rounded-xl border border-primary/30 bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {milestones.some((item) => item.id === editor.week.id)
                  ? `Edit project week ${editor.week.week}`
                  : "Add project milestone"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Define expected progress, student work, supervision, evidence, and learning time.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditor(null)}
              disabled={saving}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close milestone editor</span>
            </Button>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">Project week</span>
              <input
                type="number"
                min={1}
                max={MAX_INSTRUCTIONAL_WEEKS}
                value={editor.week.week}
                onChange={(event) => patchWeek({ week: event.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">Milestone / focus</span>
              <input
                value={editor.week.topic}
                onChange={(event) => patchWeek({ topic: event.target.value })}
                placeholder="e.g. Proposal approval, prototype review, user evaluation"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-foreground">
                Expected learning / achievement
              </span>
              <span className="block text-xs text-muted-foreground">
                One expected outcome per line. These satisfy the existing OBE weekly-plan outcome requirement without inventing lecture content.
              </span>
              <textarea
                rows={3}
                value={editor.expectedLearning}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, expectedLearning: event.target.value }
                      : current,
                  )
                }
                placeholder="Clarify the approved problem and scope\nJustify the proposed method and project plan"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <div className="space-y-2 lg:col-span-2">
              <p className="text-sm font-medium text-foreground">Linked CLOs</p>
              <div className="flex flex-wrap gap-2">
                {activeClos.map((clo) => {
                  const selected = editor.week.cloCodes.includes(clo.code);
                  return (
                    <button
                      key={clo.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        patchWeek({
                          cloCodes: selected
                            ? editor.week.cloCodes.filter((code) => code !== clo.code)
                            : [...editor.week.cloCodes, clo.code],
                        })
                      }
                      className={[
                        "rounded-full border px-3 py-1.5 text-sm",
                        selected
                          ? "border-primary bg-primary/10 font-medium text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/60",
                      ].join(" ")}
                    >
                      {clo.code}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-foreground">
                Student project activities
              </span>
              <span className="block text-xs text-muted-foreground">
                One activity per line; describe what students do rather than what a lecturer teaches.
              </span>
              <textarea
                rows={3}
                value={editor.studentActivities}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, studentActivities: event.target.value }
                      : current,
                  )
                }
                placeholder="Meet supervisor and confirm scope\nCollect or prepare evidence/data\nImplement and document agreed work"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <div className="lg:col-span-2">
              <ChipMultiSelect
                label="Supervision / learning methods"
                options={teachingMethods}
                selectedIds={editor.week.teachingMethodIds}
                onChange={(teachingMethodIds) => patchWeek({ teachingMethodIds })}
                emptyMessage="Define suitable supervision/project-learning methods in Method Management first."
              />
            </div>

            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Supervision / consultation hours
              </span>
              <input
                type="number"
                min={0}
                step="0.5"
                value={editor.week.otherHours}
                onChange={(event) => patchWeek({ otherHours: event.target.value })}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Independent project work hours
              </span>
              <input
                type="number"
                min={0}
                step="0.5"
                value={editor.week.selfStudyHours}
                onChange={(event) =>
                  patchWeek({ selfStudyHours: event.target.value })
                }
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-foreground">
                Review / evidence
              </span>
              <input
                value={editor.week.assessment}
                onChange={(event) => patchWeek({ assessment: event.target.value })}
                placeholder="e.g. Supervisor milestone review; proposal/prototype/demo evidence"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-foreground">
                Project resources
              </span>
              <input
                value={editor.week.teachingResourceTypes.join(", ")}
                onChange={(event) =>
                  patchWeek({
                    teachingResourceTypes: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="GitHub, dataset, lab equipment, documentation"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Expected project progress
              </span>
              <textarea
                rows={3}
                value={editor.expectedProgress}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, expectedProgress: event.target.value }
                      : current,
                  )
                }
                placeholder="What should be demonstrably complete by this checkpoint?"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Deliverable
              </span>
              <textarea
                rows={3}
                value={editor.deliverable}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, deliverable: event.target.value } : current,
                  )
                }
                placeholder="Proposal, prototype, dataset, test report, presentation, etc."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-foreground">
                Milestone status
              </span>
              <select
                value={editor.progressStatus}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? {
                          ...current,
                          progressStatus: event.target
                            .value as WeekProjectProgress["status"],
                        }
                      : current,
                  )
                }
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </label>

            <div className="flex items-end justify-end gap-2">
              <Button variant="outline" onClick={() => setEditor(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void saveMilestone()} disabled={saving}>
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Save milestone
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {milestones.length === 0 ? (
        <CourseSpecEmptyState
          title="No project milestones yet"
          description="Add the expected stages of the Final Project. You do not need to invent weekly lecture topics."
          action={
            <Button size="sm" onClick={addMilestone}>
              <Plus className="mr-1.5 h-4 w-4" /> Add first milestone
            </Button>
          }
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Project week</th>
                  <th className="px-4 py-3 font-semibold">Milestone / focus</th>
                  <th className="px-4 py-3 font-semibold">CLOs</th>
                  <th className="px-4 py-3 font-semibold">Review / evidence</th>
                  <th className="px-4 py-3 font-semibold">SLT</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {milestones.map((week) => (
                  <tr key={week.id} className="align-top hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {week.week}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {week.topic || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {week.cloCodes.join(", ") || "—"}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-muted-foreground">
                      {week.assessment || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {weekSltForm(week)} h
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void openEditor(week)}
                          disabled={saving || loadingEditor}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit project week {week.week}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void deleteMilestone(week.id)}
                          disabled={saving}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove project week {week.week}</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </CourseSpecAuthoringStack>
  );
}
