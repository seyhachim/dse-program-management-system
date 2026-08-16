"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurriculumCourseSpecBindings } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  curriculumApi,
  curriculumVersionLabel,
  type ProgrammeCurriculumListItem,
} from "@/lib/curriculum";

export function courseSpecVersionLabel(version: { version: string }): string {
  return `CourseSpec v${version.version}`;
}

export function CurriculumCourseSpecBindingsPanel() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("programme:write") ?? false;
  const [curricula, setCurricula] = useState<ProgrammeCurriculumListItem[]>([]);
  const [curriculumId, setCurriculumId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [data, setData] = useState<CurriculumCourseSpecBindings | null>(null);
  const [busyPlacementId, setBusyPlacementId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => curricula.find((item) => item.id === curriculumId) ?? null,
    [curricula, curriculumId],
  );

  const loadVersion = useCallback(async (id: string) => {
    setError(null);
    setData(null);
    setVersionId(id);
    if (!id) return;
    try {
      setData(await curriculumApi.courseSpecBindings(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load CourseSpec bindings");
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const list = await curriculumApi.list();
        setCurricula(list);
        const first = list[0];
        const latest = first?.versions[0];
        if (first && latest) {
          setCurriculumId(first.id);
          await loadVersion(latest.id);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not load CourseSpec bindings");
      }
    })();
  }, [loadVersion]);

  const save = async (placementId: string, courseSpecVersionId: string | null) => {
    if (!data) return;
    setBusyPlacementId(placementId);
    setError(null);
    try {
      setData(
        await curriculumApi.bindCourseSpec(data.versionId, placementId, {
          courseSpecVersionId,
        }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save CourseSpec binding");
    } finally {
      setBusyPlacementId(null);
    }
  };

  if (!selected || (!data && !error)) return null;

  const editable = Boolean(canWrite && data?.versionStatus === "Draft");

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm" aria-label="Curriculum CourseSpec bindings">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Course specification evidence</p>
          <h2 className="mt-1 font-semibold text-foreground">Bind each curriculum course to an exact approved CourseSpec</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The selected version is frozen into the curriculum record. Approving a newer CourseSpec later does not change historical curriculum evidence.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {curricula.length > 1 && (
            <label className="text-sm">Curriculum
              <select
                value={curriculumId}
                onChange={(event) => {
                  const id = event.target.value;
                  const item = curricula.find((entry) => entry.id === id);
                  setCurriculumId(id);
                  void loadVersion(item?.versions[0]?.id ?? "");
                }}
                className="mt-1 block h-10 rounded-md border border-input bg-background px-3"
              >
                {curricula.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm">Version
            <select
              value={versionId}
              onChange={(event) => void loadVersion(event.target.value)}
              className="mt-1 block h-10 rounded-md border border-input bg-background px-3"
            >
              {selected.versions.map((version) => (
                <option key={version.id} value={version.id}>{curriculumVersionLabel(version)} · {version.status}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {data && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full border px-2.5 py-1 font-medium ${data.activationReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {data.activationReady ? "Activation ready" : `${data.missingBindingCount} binding${data.missingBindingCount === 1 ? "" : "s"} missing or invalid`}
            </span>
            {data.versionStatus !== "Draft" && <span className="rounded-full border bg-muted px-2.5 py-1 text-xs">Read-only historical binding</span>}
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Exact CourseSpec</th>
                  <th className="px-4 py-3">Approved versions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.bindings.map((binding) => (
                  <tr key={binding.placementId}>
                    <td className="px-4 py-3"><p className="font-medium">{binding.courseCode}</p><p className="text-xs text-muted-foreground">{binding.courseTitle}</p></td>
                    <td className="px-4 py-3">
                      {binding.linkedVersion ? (
                        <span className="font-medium">{courseSpecVersionLabel(binding.linkedVersion)}</span>
                      ) : (
                        <span className="text-amber-700">Not bound</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editable ? (
                        <select
                          value={binding.linkedVersion?.id ?? ""}
                          disabled={busyPlacementId === binding.placementId}
                          onChange={(event) => void save(binding.placementId, event.target.value || null)}
                          className="h-9 min-w-52 rounded-md border border-input bg-background px-2 disabled:opacity-50"
                        >
                          <option value="">Not bound</option>
                          {binding.eligibleVersions.map((version) => (
                            <option key={version.id} value={version.id}>{courseSpecVersionLabel(version)}</option>
                          ))}
                        </select>
                      ) : binding.eligibleVersions.length > 0 ? (
                        <span className="text-muted-foreground">{binding.eligibleVersions.map((version) => `v${version.version}`).join(", ")}</span>
                      ) : (
                        <span className="text-muted-foreground">No approved CourseSpec</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.bindings.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No curriculum course placements in this version.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {!editable && data.missingBindingCount > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">This historical version cannot be edited. Create a new curriculum revision to reconcile missing CourseSpec bindings.</p>
          )}
        </>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
