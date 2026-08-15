"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  Info,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@dse-pms/ui";
import {
  assessmentSltHours,
  assessmentTotalWeight,
  assessmentTypeChip,
  type AssessmentForm,
} from "./assessment-model";
import { type CloForm, withCodes } from "./clo-model";
import { cloChip } from "./weekly-plan-model";

export {
  EMPTY_ASSESSMENTS,
  toAssessmentForm,
  toAssessmentPayload,
  type AssessmentForm,
} from "./assessment-model";

export function AssessmentSection({
  value,
  clos: cloValue,
  courseId,
  onPersist,
}: {
  value: AssessmentForm[];
  clos: CloForm[];
  courseId: string;
  onPersist: (items: AssessmentForm[]) => Promise<boolean>;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const clos = useMemo(() => withCodes(cloValue), [cloValue]);
  const total = assessmentTotalWeight(value);

  const activeAssessments = useMemo(
    () => value.filter((assessment) => assessment.status !== "inactive"),
    [value],
  );

  const assessedCloCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const assessment of activeAssessments) {
      for (const code of assessment.cloCodes) codes.add(code);
    }
    return codes;
  }, [activeAssessments]);

  const unassessedClos = useMemo(
    () => clos.filter((clo) => !assessedCloCodes.has(clo.code)),
    [clos, assessedCloCodes],
  );

  const assessedCloCount = clos.length - unassessedClos.length;
  const coveragePercent =
    clos.length > 0 ? Math.round((assessedCloCount / clos.length) * 100) : 0;
  const coverageComplete = clos.length > 0 && unassessedClos.length === 0;
  const totalOk = value.length === 0 || Math.round(total) === 100;

  const openAdd = () => router.push(`/courses/${courseId}/spec/assessment/add`);
  const openEdit = (id: string) =>
    router.push(`/courses/${courseId}/spec/assessment/${id}/edit`);
  const openRubrics = () =>
    router.push(`/courses/${courseId}/spec/assessment/rubrics`);

  const duplicate = async (index: number) => {
    const src = value[index];
    if (!src) return;
    const copy: AssessmentForm = {
      ...src,
      id: globalThis.crypto.randomUUID(),
      name: `${src.name} (copy)`,
    };
    const ok = await onPersist([
      ...value.slice(0, index + 1),
      copy,
      ...value.slice(index + 1),
    ]);
    setNotice(
      ok ? `"${copy.name}" was created.` : "Could not duplicate the assessment.",
    );
  };

  const remove = async (index: number) => {
    const src = value[index];
    if (!src) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${src.name}"? This can't be undone.`)
    ) {
      return;
    }
    const ok = await onPersist(value.filter((_, i) => i !== index));
    setNotice(
      ok ? `"${src.name}" was deleted.` : "Could not delete the assessment.",
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Assessment</h2>
          <p className="text-sm text-muted-foreground">
            Define assessments, link them to CLOs, set weightings, and plan the
            assessment schedule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={openRubrics}>
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Rubric Library
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Assessment
          </Button>
        </div>
      </div>

      {notice ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-xs font-medium hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                CLO Assessment Coverage
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Based on CLOs linked to active assessments.
              </p>
            </div>
            {coverageComplete ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Complete
              </span>
            ) : null}
          </div>

          {clos.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-4">
              <p className="text-sm text-muted-foreground">No CLOs are defined yet.</p>
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <span className="text-2xl font-bold text-foreground">
                    {assessedCloCount}
                  </span>
                  <span className="ml-1 text-sm text-muted-foreground">
                    of {clos.length} CLO{clos.length === 1 ? "" : "s"} assessed
                  </span>
                </div>
                <span className="text-sm font-semibold text-foreground">
                  {coveragePercent}%
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-all"
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
              {unassessedClos.length > 0 ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                    <div>
                      <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                        CLOs without an active assessment
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {unassessedClos.map((clo) => (
                          <span
                            key={clo.id}
                            className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${cloChip(clo.code)}`}
                          >
                            {clo.code}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  Every CLO is covered by at least one active assessment.
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Assessment Weight
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Active assessment weight should total 100%.
              </p>
            </div>
            {value.length > 0 && totalOk ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Complete
              </span>
            ) : null}
          </div>
          <div className="mt-4">
            <span
              className={`text-2xl font-bold ${totalOk ? "text-foreground" : "text-status-live"}`}
            >
              {Math.round(total * 100) / 100}%
            </span>
            <span className="ml-1 text-sm text-muted-foreground">of 100%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-all"
              style={{ width: `${Math.min(Math.max(total, 0), 100)}%` }}
            />
          </div>
          {value.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-4">
              <p className="text-sm text-muted-foreground">
                Add assessments to define the course assessment weighting.
              </p>
            </div>
          ) : totalOk ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Active assessment weight equals 100%.
            </p>
          ) : (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-status-live/40 bg-status-live/10 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-status-live" />
              <p className="text-xs text-status-live">
                Active assessment weight is {Math.round(total * 100) / 100}%. It
                must total 100%.
              </p>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Assessment Plan</h3>
        </div>

        {value.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm text-muted-foreground">No assessments yet.</p>
            <button
              type="button"
              onClick={openAdd}
              className="mt-1 text-sm font-medium text-accent-foreground hover:underline"
            >
              + Add your first assessment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="w-8 py-2 pr-2">#</th>
                  <th className="py-2 pr-3">Assessment Name</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Assesses</th>
                  <th className="py-2 pr-3 text-center">Weight</th>
                  <th className="py-2 pr-3 text-center">Total SLT</th>
                  <th className="py-2 pr-3">Schedule</th>
                  <th className="py-2 pr-3">Rubric</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>

              <tbody>
                {value.map((assessment, index) => {
                  const totalSlt = assessmentSltHours(assessment);
                  const categoryLabel =
                    assessment.assessmentCategory === "final"
                      ? "Final"
                      : "Continuous";
                  return (
                    <tr
                      key={assessment.id}
                      className="border-b border-border/70 align-top"
                    >
                      <td className="py-3 pr-2 text-muted-foreground">{index + 1}</td>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => openEdit(assessment.id)}
                          className="text-left font-medium text-accent-foreground hover:underline"
                        >
                          {assessment.name || "Untitled"}
                        </button>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${assessmentTypeChip(assessment.type)}`}
                        >
                          {assessment.type}
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            assessment.assessmentCategory === "final"
                              ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                              : "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                          }`}
                        >
                          {categoryLabel}
                        </span>
                      </td>
                      <td className="max-w-[260px] py-3 pr-3">
                        <div className="flex flex-wrap gap-1">
                          {assessment.cloCodes.length ? (
                            assessment.cloCodes.map((code) => (
                              <span
                                key={code}
                                className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${cloChip(code)}`}
                              >
                                {code}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-center text-foreground">
                        {assessment.weight === "" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          `${assessment.weight}%`
                        )}
                      </td>
                      <td className="py-3 pr-3 text-center">
                        {totalSlt > 0 ? (
                          <span className="font-medium tabular-nums text-foreground">
                            {totalSlt} h
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openEdit(assessment.id)}
                            className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
                            title="Add assessment SLT for the official Section 16 table"
                          >
                            Not set
                          </button>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {assessment.dueWeek ? (
                          <span className="text-foreground">Week {assessment.dueWeek}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {assessment.rubricId ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" /> Attached
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        {assessment.status === "inactive" ? (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Inactive
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            label={`Edit ${assessment.name}`}
                            onClick={() => openEdit(assessment.id)}
                          >
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={`Duplicate ${assessment.name}`}
                            onClick={() => void duplicate(index)}
                          >
                            <Copy className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={`Delete ${assessment.name}`}
                            danger
                            onClick={() => void remove(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t border-border text-sm font-semibold text-foreground">
                  <td colSpan={5} className="py-2.5 pr-3">Total</td>
                  <td
                    className={`py-2.5 pr-3 text-center ${totalOk ? "text-foreground" : "text-status-live"}`}
                  >
                    {Math.round(total * 100) / 100}%
                  </td>
                  <td className="py-2.5 pr-3 text-center tabular-nums">
                    {activeAssessments.reduce(
                      (sum, assessment) => sum + assessmentSltHours(assessment),
                      0,
                    )} h
                  </td>
                  <td colSpan={4} className="py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {value.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing 1 to {value.length} of {value.length} assessment
              {value.length === 1 ? "" : "s"}
            </p>
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                totalOk
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-status-live/40 bg-status-live/10 text-status-live"
              }`}
            >
              <Info className="h-3.5 w-3.5 shrink-0" />
              {totalOk
                ? "Total weight equals 100%."
                : `Total weight is ${Math.round(total * 100) / 100}% — active assessments must sum to 100%.`}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function IconButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted ${
        danger
          ? "text-status-live hover:border-status-live/40"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
