"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AcademicYearView,
  CurriculumWorkflowAction,
  CurriculumWorkflowState,
  StudentCohortSummaryView,
} from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { academicCalendarApi } from "@/lib/academic-calendar";
import { curriculumApi, curriculumStatusLabel, curriculumVersionLabel, type ProgrammeCurriculumListItem } from "@/lib/curriculum";
import { studentsApi } from "@/lib/students";

const CURRENT_PROGRAMME_ID = "dse";

const ACTION_LABEL: Record<CurriculumWorkflowAction, string> = {
  submit: "Submit for review",
  requestChanges: "Request changes",
  approve: "Approve",
  activate: "Activate",
};

export function CurriculumWorkflowActions() {
  const [curricula, setCurricula] = useState<ProgrammeCurriculumListItem[]>([]);
  const [cohorts, setCohorts] = useState<StudentCohortSummaryView[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearView[]>([]);
  const [versionId, setVersionId] = useState("");
  const [workflow, setWorkflow] = useState<CurriculumWorkflowState | null>(null);
  const [comment, setComment] = useState("");
  const [cohortId, setCohortId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const versions = useMemo(() => curricula.flatMap((curriculum) => curriculum.versions), [curricula]);
  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === versionId) ?? null,
    [versions, versionId],
  );
  const selectedCohort = useMemo(
    () => cohorts.find((cohort) => cohort.id === cohortId) ?? null,
    [cohorts, cohortId],
  );
  const selectedAcademicYear = useMemo(
    () => academicYears.find((year) => year.id === academicYearId) ?? null,
    [academicYears, academicYearId],
  );

  useEffect(() => {
    if (!selectedVersion) {
      setCohortId("");
      setAcademicYearId("");
      return;
    }

    const cohort = cohorts.find(
      (item) => item.name === selectedVersion.cohortLabel && item.intakeYear === selectedVersion.intakeYear,
    );
    const year = academicYears.find((item) => item.label === selectedVersion.academicYear);
    setCohortId(cohort?.id ?? "");
    setAcademicYearId(year?.id ?? "");
  }, [
    selectedVersion?.id,
    selectedVersion?.cohortLabel,
    selectedVersion?.intakeYear,
    selectedVersion?.academicYear,
    cohorts,
    academicYears,
  ]);

  const metadataMissing = !selectedCohort || !selectedAcademicYear;
  const metadataDirty = Boolean(
    selectedVersion &&
      selectedCohort &&
      selectedAcademicYear &&
      (selectedCohort.name !== selectedVersion.cohortLabel ||
        selectedCohort.intakeYear !== selectedVersion.intakeYear ||
        selectedAcademicYear.label !== selectedVersion.academicYear),
  );

  const loadState = useCallback(async (id: string) => {
    if (!id) return;
    setError(null);
    try {
      setWorkflow(await curriculumApi.workflow(id));
    } catch (err) {
      setWorkflow(null);
      setError(err instanceof ApiError ? err.message : "Could not load curriculum workflow");
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const [list, cohortList, yearList] = await Promise.all([
        curriculumApi.list(),
        studentsApi.cohorts(CURRENT_PROGRAMME_ID),
        academicCalendarApi.years(CURRENT_PROGRAMME_ID),
      ]);
      setCurricula(list);
      setCohorts(
        cohortList
          .filter((cohort) => cohort.status !== "Archived")
          .sort((a, b) => a.intakeYear - b.intakeYear),
      );
      setAcademicYears([...yearList].sort((a, b) => a.startYear - b.startYear));
      const firstVersion = list[0]?.versions[0];
      if (firstVersion) {
        setVersionId(firstVersion.id);
        await loadState(firstVersion.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load curriculum workflow");
    }
  }, [loadState]);

  useEffect(() => { void load(); }, [load]);

  const persistMetadata = async () => {
    if (!versionId) return false;
    if (!selectedCohort || !selectedAcademicYear) {
      setError("Select both the cohort and academic year before review.");
      return false;
    }

    const next = await curriculumApi.updateWorkflowMetadata(versionId, {
      cohortLabel: selectedCohort.name,
      intakeYear: selectedCohort.intakeYear,
      academicYear: selectedAcademicYear.label,
    });
    setWorkflow(next);
    setCurricula(await curriculumApi.list());
    return true;
  };

  const saveMetadata = async () => {
    if (!metadataDirty || metadataMissing) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (await persistMetadata()) {
        setNotice("Curriculum review metadata saved.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save curriculum review metadata");
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: CurriculumWorkflowAction) => {
    if (!versionId) return;
    if (action === "requestChanges" && !comment.trim()) {
      setError("A reason is required when requesting changes.");
      return;
    }
    if (action === "submit" && metadataMissing) {
      setError("Select both the cohort and academic year before submitting for review.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (action === "submit" && metadataDirty) {
        if (!(await persistMetadata())) return;
      }

      const next =
        action === "submit" ? await curriculumApi.submit(versionId, comment.trim()) :
        action === "requestChanges" ? await curriculumApi.requestChanges(versionId, comment.trim()) :
        action === "approve" ? await curriculumApi.approve(versionId, comment.trim()) :
        await curriculumApi.activate(versionId, comment.trim());
      setWorkflow(next);
      setComment("");
      setCurricula(await curriculumApi.list());
      setNotice(
        action === "submit" ? "Curriculum submitted for review." :
        action === "requestChanges" ? "Changes requested." :
        action === "approve" ? "Curriculum approved." :
        "Curriculum activated.",
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update curriculum workflow");
    } finally {
      setBusy(false);
    }
  };

  if (!versions.length) return null;

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm" aria-label="Curriculum workflow">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approval workflow</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-foreground">{workflow ? curriculumStatusLabel(workflow.status) : "Loading…"}</h2>
            {workflow?.status === "UnderReview" && <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800">Editing locked</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Actions are returned by the backend for the selected lifecycle state; the client does not invent approval rights.</p>
        </div>
        <label className="text-sm font-medium">Workflow version
          <select
            value={versionId}
            onChange={(event) => {
              setVersionId(event.target.value);
              setError(null);
              setNotice(null);
              void loadState(event.target.value);
            }}
            className="mt-1 block h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {versions.map((version) => <option key={version.id} value={version.id}>{curriculumVersionLabel(version)} · {curriculumStatusLabel(version.status)}</option>)}
          </select>
        </label>
      </div>

      {workflow?.status === "Draft" && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-medium">Cohort
              <select
                value={cohortId}
                onChange={(event) => setCohortId(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select cohort</option>
                {cohorts.map((cohort) => (
                  <option key={cohort.id} value={cohort.id}>{cohort.name} · Intake {cohort.intakeYear}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">Intake year
              <input
                value={selectedCohort?.intakeYear ?? ""}
                readOnly
                aria-readonly="true"
                placeholder="Auto-filled"
                className="mt-1 h-10 w-full rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
              />
            </label>
            <label className="block text-sm font-medium">Academic year
              <select
                value={academicYearId}
                onChange={(event) => setAcademicYearId(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select academic year</option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? " · Current" : ""}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || metadataMissing || !metadataDirty}
              onClick={() => void saveMetadata()}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Save review metadata
            </button>
            <p className={metadataMissing ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
              {metadataMissing
                ? "Cohort, intake year, and academic year are required before review."
                : metadataDirty
                  ? "Unsaved changes will also be saved automatically when you submit for review."
                  : "Review metadata is complete."}
            </p>
          </div>
        </div>
      )}

      {workflow && workflow.allowedActions.length > 0 && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <label className="block text-sm font-medium">Workflow comment
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={2} maxLength={2000} placeholder="Committee note, approval note, or reason for requested changes" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap gap-2">
            {workflow.allowedActions.map((action) => (
              <button key={action} type="button" disabled={busy} onClick={() => void run(action)} className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent disabled:opacity-50">
                {ACTION_LABEL[action]}
              </button>
            ))}
          </div>
        </div>
      )}
      {workflow?.lastComment && <p className="mt-3 text-xs text-muted-foreground">Latest review note: {workflow.lastComment}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
