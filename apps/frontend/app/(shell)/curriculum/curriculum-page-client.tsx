"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProgrammeCurriculumRead } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  curriculumApi,
  curriculumStatusLabel,
  curriculumVersionLabel,
  revisionTriggerLabel,
  type ProgrammeCurriculumListItem,
} from "@/lib/curriculum";
import { CurriculumEditor } from "./curriculum-editor";

const STATUS_CLASS: Record<ProgrammeCurriculumRead["selectedVersion"]["status"], string> = {
  Draft: "border-amber-200 bg-amber-50 text-amber-800",
  Approved: "border-blue-200 bg-blue-50 text-blue-800",
  Active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Superseded: "border-slate-200 bg-slate-100 text-slate-700",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CurriculumSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" aria-label="Loading curriculum">
      <div className="space-y-4">
        {[1, 2, 3, 4].map((year) => (
          <div key={year} className="h-36 animate-pulse rounded-xl border border-border bg-muted/40" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-border bg-muted/40" />
    </div>
  );
}

export function CurriculumPageClient() {
  const { me, loading: meLoading } = useMe();
  const canWrite = me?.permissions.includes("programme:write") ?? false;
  const [curricula, setCurricula] = useState<ProgrammeCurriculumListItem[]>([]);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<string>("");
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [data, setData] = useState<ProgrammeCurriculumRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const loadVersion = useCallback(async (curriculumId: string, versionId?: string) => {
    setLoading(true);
    setError(null);
    setPermissionDenied(false);
    try {
      const result = await curriculumApi.get(curriculumId, versionId);
      setData(result);
      setSelectedVersionId(result.selectedVersion.id);
    } catch (err) {
      setData(null);
      if (err instanceof ApiError && err.status === 403) {
        setPermissionDenied(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to load curriculum");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPermissionDenied(false);
    try {
      const list = await curriculumApi.list();
      setCurricula(list);
      if (list.length === 0) {
        setSelectedCurriculumId("");
        setSelectedVersionId("");
        setData(null);
        setLoading(false);
        return;
      }
      const first = list[0]!;
      setSelectedCurriculumId(first.id);
      await loadVersion(first.id);
    } catch (err) {
      setData(null);
      if (err instanceof ApiError && err.status === 403) {
        setPermissionDenied(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Failed to load curriculum");
      }
      setLoading(false);
    }
  }, [loadVersion]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedListItem = useMemo(
    () => curricula.find((curriculum) => curriculum.id === selectedCurriculumId) ?? null,
    [curricula, selectedCurriculumId],
  );

  const handleCurriculumChange = async (curriculumId: string) => {
    setSelectedCurriculumId(curriculumId);
    setSelectedVersionId("");
    await loadVersion(curriculumId);
  };

  const handleVersionChange = async (versionId: string) => {
    setSelectedVersionId(versionId);
    if (selectedCurriculumId) await loadVersion(selectedCurriculumId, versionId);
  };

  const handleSaved = (result: ProgrammeCurriculumRead) => {
    setData(result);
    setSelectedVersionId(result.selectedVersion.id);
    setCurricula((current) =>
      current.map((curriculum) =>
        curriculum.id === result.curriculum.id
          ? { ...curriculum, versions: result.versions }
          : curriculum,
      ),
    );
  };

  if (meLoading || loading) return <CurriculumSkeleton />;

  if (permissionDenied) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="font-semibold text-foreground">Curriculum access denied</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is not assigned curriculum access for this programme.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="font-semibold text-foreground">Could not load curriculum</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data || curricula.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <h2 className="text-lg font-semibold text-foreground">No programme curriculum yet</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          The versioned curriculum foundation is ready, but no canonical curriculum has been created for DSE yet.
          We will import the current approved curriculum separately after the workflow is complete.
        </p>
      </div>
    );
  }

  const version = data.selectedVersion;
  const isHistorical = version.status === "Approved" || version.status === "Active" || version.status === "Superseded";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-foreground">{data.curriculum.name}</h2>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[version.status]}`}>
                {curriculumStatusLabel(version.status)}
              </span>
              {isHistorical ? (
                <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  Read-only snapshot
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.curriculum.code} · {version.cohortLabel || "No cohort label"}
              {version.academicYear ? ` · ${version.academicYear}` : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {curricula.length > 1 ? (
              <label className="text-sm font-medium text-foreground">
                Curriculum
                <select
                  value={selectedCurriculumId}
                  onChange={(event) => void handleCurriculumChange(event.target.value)}
                  className="mt-1 block h-10 min-w-48 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {curricula.map((curriculum) => (
                    <option key={curriculum.id} value={curriculum.id}>{curriculum.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="text-sm font-medium text-foreground">
              Version
              <select
                value={selectedVersionId}
                onChange={(event) => void handleVersionChange(event.target.value)}
                className="mt-1 block h-10 min-w-40 rounded-md border border-input bg-background px-3 text-sm"
              >
                {(selectedListItem?.versions ?? data.versions).map((item) => (
                  <option key={item.id} value={item.id}>
                    {curriculumVersionLabel(item)} · {curriculumStatusLabel(item.status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <CurriculumEditor data={data} canWrite={canWrite} onSaved={handleSaved} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Curriculum credit summary">
        <Stat label="Total credits" value={data.totals.programmeCredits} />
        <Stat label="Core" value={data.totals.coreCredits} />
        <Stat label="Basic" value={data.totals.basicCredits} />
        <Stat label="Elective" value={data.totals.electiveCredits} />
        <Stat label="Specialization" value={data.totals.specializationCredits} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {data.years.map((year) => (
            <section key={year.yearLevel} className="rounded-xl border border-border bg-card shadow-sm">
              <header className="flex items-center justify-between border-b border-border px-5 py-4">
                <h3 className="font-semibold text-foreground">Year {year.yearLevel}</h3>
                <span className="text-sm font-medium text-muted-foreground">{year.totalCredits} credits</span>
              </header>
              <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border">
                {year.semesters.map((semester) => (
                  <div key={semester.semester} className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">
                        Semester {semester.semester === "First" ? "1" : "2"}
                      </h4>
                      <span className="text-xs font-medium text-muted-foreground">{semester.totalCredits} credits</span>
                    </div>
                    {semester.courses.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground">
                        No courses assigned
                      </p>
                    ) : (
                      <div className="divide-y divide-border rounded-lg border border-border">
                        {semester.courses.map((course) => (
                          <div key={course.placementId} className="flex gap-3 px-3 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-muted-foreground">{course.code}</p>
                              <p className="mt-0.5 text-sm font-medium text-foreground">{course.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{course.courseType}</p>
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-foreground">{course.credits}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="font-semibold text-foreground">Revision summary</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Revision</dt>
                <dd className="font-medium text-foreground">{version.revisionType}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Effective from</dt>
                <dd className="font-medium text-foreground">{version.effectiveFrom || "Not set"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reason for change</dt>
                <dd className="mt-1 whitespace-pre-wrap text-foreground">{version.revisionReason || "Initial curriculum version"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Change summary</dt>
                <dd className="mt-1 whitespace-pre-wrap text-foreground">{version.changeSummary || "Initial curriculum baseline"}</dd>
              </div>
            </dl>
            {version.revisionTriggers.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {version.revisionTriggers.map((trigger) => (
                  <span key={trigger} className="rounded-full border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {revisionTriggerLabel(trigger)}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-foreground">Version timeline</h3>
              {canWrite && version.status === "Draft" ? (
                <span className="text-xs font-medium text-amber-700">Editable draft</span>
              ) : null}
            </div>
            <ol className="mt-4 space-y-4">
              {data.versions.map((item) => (
                <li key={item.id} className="relative border-l border-border pl-4">
                  <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-background bg-foreground" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{curriculumVersionLabel(item)}</span>
                    <span className="text-xs text-muted-foreground">{curriculumStatusLabel(item.status)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{item.changeSummary || item.revisionType}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
