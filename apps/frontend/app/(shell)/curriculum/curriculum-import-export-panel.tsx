"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CurriculumImportPreview,
  CurriculumVersionSummary,
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

export function CurriculumImportExportPanel() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("programme:write") ?? false;
  const [curricula, setCurricula] = useState<ProgrammeCurriculumListItem[]>([]);
  const [versionId, setVersionId] = useState("");
  const [workflow, setWorkflow] = useState<CurriculumWorkflowState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [preview, setPreview] = useState<CurriculumImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
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

  const chooseVersion = async (id: string) => {
    setVersionId(id);
    setPreview(null);
    setError(null);
    setSuccess(null);
    await loadWorkflow(id);
  };

  const chooseFile = async (next: File | null) => {
    setFile(next);
    setPreview(null);
    setError(null);
    setSuccess(null);
    setJsonText(next ? await next.text() : "");
  };

  const previewImport = async () => {
    if (!versionId || !file || !jsonText) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
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
      setBusy(false);
    }
  };

  const applyImport = async () => {
    if (!versionId || !file || !jsonText || !preview?.canApply) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const artifact = await curriculumApi.applyJson(versionId, {
        fileName: file.name,
        jsonText,
      });
      setSuccess(
        `Imported ${artifact.totals.selectedRouteCourseCount} default-route courses. Reloading the canonical curriculum…`,
      );
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not apply curriculum JSON");
    } finally {
      setBusy(false);
    }
  };

  const exportWord = async () => {
    if (!versionId || !exportable) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const artifact = await curriculumApi.artifact(versionId);
      await exportCurriculumWord(artifact);
      setSuccess(`Exported DSE curriculum v${artifact.curriculum.version} as DOCX.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not export curriculum DOCX");
    } finally {
      setBusy(false);
    }
  };

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
            Import structured curriculum data only into an editable Draft. Exported Word files are generated from the selected canonical PMS version, including Year-IV alternative pathways.
          </p>
        </div>
        <label className="text-sm font-medium">
          Version
          <select
            value={versionId}
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

      {editable && (
        <div className="mt-5 space-y-4 border-t border-border pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm font-medium">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
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
              Preview import
            </button>
          </div>

          {preview && (
            <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Rows</p><p className="font-semibold">{preview.courses.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Common credits</p><p className="font-semibold">{preview.totals.commonCredits}</p></div>
                <div><p className="text-xs text-muted-foreground">Default route</p><p className="font-semibold">{preview.totals.selectedRouteCredits} credits</p></div>
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
                <p className="text-sm font-medium">Course matching</p>
                <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-background">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted"><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Course</th><th className="px-3 py-2">Pathway</th><th className="px-3 py-2">Match</th></tr></thead>
                    <tbody>
                      {preview.courses.map((course) => (
                        <tr key={`${course.pathwayCode ?? "common"}:${course.code}`} className="border-t border-border">
                          <td className="px-3 py-2 font-mono">{course.code}</td>
                          <td className="px-3 py-2">{course.title}</td>
                          <td className="px-3 py-2">{course.pathwayCode ?? "Common"}</td>
                          <td className="px-3 py-2"><span className={course.matchStatus === "matched" ? "text-emerald-700" : "text-destructive"}>{course.matchStatus}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {preview.blockers.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-sm font-medium text-destructive">Blocking issues</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-destructive">
                    {preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                  </ul>
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
                disabled={busy || !preview.canApply}
                onClick={() => void applyImport()}
                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Apply to Draft
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
            Export DOCX
          </button>
          <p className="text-xs text-muted-foreground">
            Word export uses the immutable selected version and the official DSE landscape curriculum layout.
          </p>
        </div>
      )}

      {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
