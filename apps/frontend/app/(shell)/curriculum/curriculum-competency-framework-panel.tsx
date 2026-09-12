"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProgrammeCompetencyFrameworkVersion, ProgrammeCurriculumRead } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { curriculumApi } from "@/lib/curriculum";

export function CurriculumCompetencyFrameworkPanel({
  data,
  canManage,
  onUpdated,
}: {
  data: ProgrammeCurriculumRead;
  canManage: boolean;
  onUpdated: (data: ProgrammeCurriculumRead) => void;
}) {
  const binding = data.competencyFramework;
  const [versions, setVersions] = useState<ProgrammeCompetencyFrameworkVersion[]>([]);
  const [selectedId, setSelectedId] = useState(binding?.frameworkVersionId ?? "");
  const [code, setCode] = useState(binding?.frameworkCode ?? "dse-graduate-competencies");
  const [name, setName] = useState(binding?.name ?? "DSE Graduate Competencies");
  const [changeNote, setChangeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(binding?.frameworkVersionId ?? "");
    setCode(binding?.frameworkCode ?? "dse-graduate-competencies");
    setName(binding?.name ?? "DSE Graduate Competencies");
  }, [binding?.frameworkVersionId, binding?.frameworkCode, binding?.name]);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void curriculumApi
      .listCompetencyFrameworkVersions()
      .then((result) => {
        if (!cancelled) setVersions(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load competency framework versions");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, data.selectedVersion.id]);

  const selected = useMemo(
    () => versions.find((version) => version.frameworkVersionId === selectedId) ?? null,
    [selectedId, versions],
  );

  const bind = async (frameworkVersionId: string) => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(
        await curriculumApi.bindCompetencyFramework(data.selectedVersion.id, { frameworkVersionId }),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign competency framework");
    } finally {
      setBusy(false);
    }
  };

  const snapshotAndBind = async () => {
    setBusy(true);
    setError(null);
    try {
      const snapshot = await curriculumApi.createCompetencyFrameworkSnapshot({
        code,
        name,
        changeNote,
      });
      setVersions((current) => [snapshot, ...current]);
      setSelectedId(snapshot.frameworkVersionId);
      onUpdated(
        await curriculumApi.bindCompetencyFramework(data.selectedVersion.id, {
          frameworkVersionId: snapshot.frameworkVersionId,
        }),
      );
      setChangeNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not snapshot competency framework");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby="competency-framework-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="competency-framework-title" className="font-semibold">
            Competency framework
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Versioned graduate-competency context pinned to this curriculum version.
          </p>
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {data.selectedVersion.status === "Draft" ? "Draft design context" : "Read-only historical snapshot"}
        </span>
      </div>

      {binding ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border bg-background p-3">
            <p className="font-medium">{binding.name}</p>
            <p className="text-sm text-muted-foreground">
              {binding.frameworkCode} · Framework v{binding.version} · {binding.competencies.length} competencies
            </p>
            {binding.changeNote && (
              <p className="mt-2 text-sm text-muted-foreground">{binding.changeNote}</p>
            )}
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {binding.competencies.map((competency) => (
              <article key={competency.id} className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">{competency.code}</p>
                    <p className="font-medium">{competency.name}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 text-xs text-muted-foreground">
                    {!competency.sourceActive && (
                      <span className="rounded-full border px-2 py-0.5">Inactive at snapshot</span>
                    )}
                    {competency.ploCodes.length > 0 && <span>{competency.ploCodes.join(", ")}</span>}
                  </div>
                </div>
                {competency.description && (
                  <p className="mt-2 text-sm text-muted-foreground">{competency.description}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No competency framework is linked to this curriculum version yet. Historical versions are never guessed or backfilled.
        </p>
      )}

      {canManage && (
        <div className="mt-5 grid gap-4 border-t pt-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium">Use an existing snapshot</p>
            <div className="mt-2 flex gap-2">
              <select
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">Select framework version…</option>
                {versions.map((version) => (
                  <option key={version.frameworkVersionId} value={version.frameworkVersionId}>
                    {version.name} · v{version.version}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !selected}
                onClick={() => selected && void bind(selected.frameworkVersionId)}
                className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                Assign
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium">Snapshot current programme competencies</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-label="Framework code"
                placeholder="Framework code"
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-label="Framework name"
                placeholder="Framework name"
                className="h-10 rounded-md border bg-background px-3 text-sm"
              />
              <input
                value={changeNote}
                onChange={(event) => setChangeNote(event.target.value)}
                aria-label="Framework change note"
                placeholder="Change note (optional)"
                className="h-10 rounded-md border bg-background px-3 text-sm sm:col-span-2"
              />
            </div>
            <button
              type="button"
              disabled={busy || !code.trim() || !name.trim()}
              onClick={() => void snapshotAndBind()}
              className="mt-2 h-10 rounded-md border px-4 text-sm font-medium disabled:opacity-50"
            >
              Create snapshot & assign
            </button>
          </div>
          {error && <p className="text-sm text-destructive lg:col-span-2">{error}</p>}
        </div>
      )}
    </section>
  );
}
