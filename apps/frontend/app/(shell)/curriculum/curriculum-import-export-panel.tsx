"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CourseType,
  CurriculumImportDecision,
  CurriculumImportPreview,
  CurriculumWorkflowState,
} from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  curriculumApi,
  curriculumStatusLabel,
  curriculumVersionLabel,
  type ProgrammeCurriculumListItem,
} from "@/lib/curriculum";
import { exportCurriculumWord } from "./curriculum-word-renderer";
import {
  curriculumOperationCopy,
  type CurriculumOperation,
} from "./curriculum-operation-state";

const COURSE_TYPES: CourseType[] = ["Basic", "Core", "Elective", "Specialization", "MoeysHeip"];

type DecisionState = Record<string, CurriculumImportDecision | undefined>;

function statusBadge(status: string) {
  const classes =
    status === "Draft"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : status === "UnderReview"
        ? "border-violet-200 bg-violet-50 text-violet-800"
        : status === "Active"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : status === "Approved"
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-slate-200 bg-slate-100 text-slate-700";
  return `rounded-full border px-2 py-1 text-xs font-medium ${classes}`;
}

function isDecisionBlocker(blocker: string) {
  return (
    blocker.includes("choose Create Course") ||
    blocker.includes("title conflict requires") ||
    blocker.includes("explicit canonical course type is required")
  );
}

export function CurriculumImportExportPanel() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("programme:write") ?? false;
  const [curricula, setCurricula] = useState<ProgrammeCurriculumListItem[]>([]);
  const [versionId, setVersionId] = useState("");
  const [workflow, setWorkflow] = useState<CurriculumWorkflowState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<CurriculumImportPreview | null>(null);
  const [decisions, setDecisions] = useState<DecisionState>({});
  const [operation, setOperation] = useState<CurriculumOperation>(null);
  const busy = operation !== null;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const versions = useMemo(
    () => curricula.flatMap((curriculum) => curriculum.versions),
    [curricula],
  );
  const selected = versions.find((version) => version.id === versionId) ?? null;
  const editable = canWrite && workflow?.status === "Draft";
  const exportable =
    selected?.status === "Approved" ||
    selected?.status === "Active" ||
    selected?.status === "Superseded";

  const requiredDecisionCodes = useMemo(
    () =>
      preview?.courses
        .filter((course) => course.requiredDecision !== null)
        .map((course) => course.code) ?? [],
    [preview],
  );
  const decisionsResolved = requiredDecisionCodes.every((code) => Boolean(decisions[code]));
  const hardBlockers = preview?.blockers.filter((blocker) => !isDecisionBlocker(blocker)) ?? [];
  const canApplyPreview = Boolean(preview && decisionsResolved && hardBlockers.length === 0);

  const loadWorkflow = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setWorkflow(await curriculumApi.workflow(id));
    } catch {
      setWorkflow(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await curriculumApi.list();
        setCurricula(list);
        const initial = list[0]?.versions[0] ?? null;
        if (initial) {
          setVersionId(initial.id);
          await loadWorkflow(initial.id);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load curriculum import/export tools");
      }
    })();
  }, [loadWorkflow]);

  const resetImportState = () => {
    setPreview(null);
    setDecisions({});
    setError(null);
    setSuccess(null);
  };

  const chooseVersion = async (id: string) => {
    if (busy) return;
    setOperation("loading-version");
    setVersionId(id);
    resetImportState();
    try {
      await loadWorkflow(id);
    } finally {
      setOperation(null);
    }
  };

  const chooseFile = async (next: File | null) => {
    if (busy) return;
    setFile(next);
    resetImportState();
    if (!next) {
      setJsonText("");
      return;
    }
    setOperation("reading-file");
    try {
      setJsonText(await next.text());
    } catch {
      setJsonText("");
      setError("Could not read the selected curriculum JSON file");
    } finally {
      setOperation(null);
    }
  };

  const previewImport = async () => {
    if (!versionId || !file || !jsonText) return;
    setOperation("previewing");
    setError(null);
    setSuccess(null);
    setDecisions({});
    try {
      setPreview(
        await curriculumApi.previewJson(versionId, {
          fileName: file.name,
          jsonText,
        }),
      );
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : "Could not preview curriculum JSON");
    } finally {
      setOperation(null);
    }
  };

  const chooseCreateCourse = (courseCode: string, courseType: CourseType) => {
    setDecisions((current) => ({
      ...current,
      [courseCode]: { courseCode, action: "create-course", courseType },
    }));
  };

  const chooseKeepExisting = (courseCode: string, keep: boolean) => {
    setDecisions((current) => {
      const next = { ...current };
      if (keep) next[courseCode] = { courseCode, action: "keep-existing-course" };
      else delete next[courseCode];
      return next;
    });
  };

  const applyImport = async () => {
    if (!versionId || !file || !jsonText || !canApplyPreview) return;
    setOperation("applying");
    setError(null);
    setSuccess(null);
    try {
      const artifact = await curriculumApi.applyJson(versionId, {
        fileName: file.name,
        jsonText,
        decisions: requiredDecisionCodes.map((code) => decisions[code]!).filter(Boolean),
      });
      setSuccess(
        `Imported ${artifact.totals.selectedRouteCourseCount} selected-route courses and preserved ${artifact.pathways.length} canonical pathway(s). Reloading…`,
      );
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not apply curriculum JSON");
    } finally {
      setOperation(null);
    }
  };

  const exportWord = async () => {
    if (!versionId || !exportable) return;
    setOperation("exporting");
    setError(null);
    setSuccess(null);
    try {
      const artifact = await curriculumApi.exportArtifact(versionId);
      await exportCurriculumWord(artifact);
      setSuccess(`Exported DSE curriculum v${artifact.curriculum.version} as DOCX.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not export curriculum DOCX");
    } finally {
      setOperation(null);
    }
  };

  const operationCopy = curriculumOperationCopy(operation);

  if (!versions.length) return null;

  return (
    <section
      className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm"
      aria-label="Curriculum import and export"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Curriculum artifact
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-foreground">JSON import · DOCX export</h2>
            {workflow && (
              <span className={statusBadge(workflow.status)}>
                {curriculumStatusLabel(workflow.status)}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Import structured curriculum data only into an editable Draft. Missing or conflicting Courses require explicit decisions. Word export is served only from a published historical version.
          </p>
        </div>
        <label className="text-sm font-medium">
          Version
          <select
            value={versionId}
            disabled={busy}
            onChange={(event) => void chooseVersion(event.target.value)}
            className="mt-1 block h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {curriculumVersionLabel(version)} · {curriculumStatusLabel(version.status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {operationCopy && (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-900"
        >
          <span
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium">{operationCopy.title}</p>
            <p className="mt-0.5 text-xs">{operationCopy.description}</p>
          </div>
        </div>
      )}

      {editable && (
        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-medium">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                disabled={busy}
                onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy || !file || !jsonText}
              onClick={() => void previewImport()}
              className="h-10 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {operation === "previewing" ? (
                <span className="inline-flex items-center gap-2">
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden="true"
                  />
                  Previewing…
                </span>
              ) : (
                "Preview import"
              )}
            </button>
          </div>

          {preview && (
            <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div><p className="text-xs text-muted-foreground">Rows</p><p className="font-semibold">{preview.courses.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Common credits</p><p className="font-semibold">{preview.totals.commonCredits}</p></div>
                <div><p className="text-xs text-muted-foreground">Row calculation</p><p className="font-semibold">{preview.totals.computedSelectedRouteCredits}</p></div>
                <div><p className="text-xs text-muted-foreground">Official selected total</p><p className="font-semibold">{preview.totals.selectedRouteCredits} credits</p></div>
                <div><p className="text-xs text-muted-foreground">Source hash</p><p className="truncate font-mono text-xs">{preview.source.sha256}</p></div>
              </div>

              {preview.totals.pathways.length > 0 && (
                <div>
                  <p className="text-sm font-medium">Alternative pathways</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    {preview.totals.pathways.map((pathway) => (
                      <div key={pathway.code} className="rounded-md border border-border bg-background p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{pathway.name}</span>
                          {pathway.isDefault && <span className="text-xs text-emerald-700">Default</span>}
                        </div>
                        <p className="mt-1 text-muted-foreground">{pathway.courseCount} courses · {pathway.credits} credits</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-medium">Course matching & decisions</p>
                <div className="mt-2 max-h-96 overflow-auto rounded-md border border-border bg-background">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-3 py-2">Code</th>
                        <th className="px-3 py-2">Course</th>
                        <th className="px-3 py-2">Pathway</th>
                        <th className="px-3 py-2">Match</th>
                        <th className="px-3 py-2">Required decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.courses.map((course) => {
                        const decision = decisions[course.code];
                        return (
                          <tr key={`${course.pathwayCode ?? "common"}:${course.code}`} className="border-t border-border align-top">
                            <td className="px-3 py-2 font-mono">{course.code}</td>
                            <td className="px-3 py-2">
                              <div>{course.title}</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">{course.message}</div>
                            </td>
                            <td className="px-3 py-2">{course.pathwayCode ?? "Common"}</td>
                            <td className="px-3 py-2">
                              <span className={course.matchStatus === "matched" ? "text-emerald-700" : "text-destructive"}>
                                {course.matchStatus}
                              </span>
                            </td>
                            <td className="min-w-56 px-3 py-2">
                              {course.requiredDecision === "create-course" ? (
                                <label className="block">
                                  <span className="text-[11px] text-muted-foreground">Create canonical Course as</span>
                                  <select
                                    disabled={busy}
                                    value={decision?.action === "create-course" ? decision.courseType ?? "" : ""}
                                    onChange={(event) => {
                                      const value = event.target.value as CourseType | "";
                                      if (value) chooseCreateCourse(course.code, value);
                                      else setDecisions((current) => {
                                        const next = { ...current };
                                        delete next[course.code];
                                        return next;
                                      });
                                    }}
                                    className="mt-1 h-8 w-full rounded border border-input bg-background px-2"
                                  >
                                    <option value="">Select course type…</option>
                                    {COURSE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                                  </select>
                                </label>
                              ) : course.requiredDecision === "keep-existing-course" ? (
                                <label className="flex items-start gap-2">
                                  <input
                                    type="checkbox"
                                    disabled={busy}
                                    checked={decision?.action === "keep-existing-course"}
                                    onChange={(event) => chooseKeepExisting(course.code, event.target.checked)}
                                    className="mt-0.5"
                                  />
                                  <span>Keep the existing PMS Course title and do not rename it.</span>
                                </label>
                              ) : (
                                <span className="text-emerald-700">No decision needed</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {hardBlockers.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive">Blocking issues</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-destructive">
                    {hardBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                  </ul>
                </div>
              )}
              {requiredDecisionCodes.length > 0 && !decisionsResolved && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  <p className="text-sm font-medium">Decisions required</p>
                  <p className="mt-1 text-xs">Resolve every missing/conflicting Course above before Apply to Draft is enabled.</p>
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  <p className="text-sm font-medium">Review warnings</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                    {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}

              <button
                type="button"
                disabled={busy || !canApplyPreview}
                onClick={() => void applyImport()}
                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {operation === "applying" ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      aria-hidden="true"
                    />
                    Applying curriculum…
                  </span>
                ) : (
                  "Apply to Draft"
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {!canWrite && workflow?.status === "Draft" && (
        <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
          Draft import is restricted to programme writers. You can still view permitted curriculum data.
        </p>
      )}
      {workflow?.status === "UnderReview" && (
        <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
          Import is locked while this version is Under Review.
        </p>
      )}

      {exportable && (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void exportWord()}
            className="h-10 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {operation === "exporting" ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
                Exporting…
              </span>
            ) : (
              "Export DOCX"
            )}
          </button>
          <p className="text-xs text-muted-foreground">
            The server permits export only from immutable published versions; the DOCX uses preserved curriculum snapshots.
          </p>
        </div>
      )}

      {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
