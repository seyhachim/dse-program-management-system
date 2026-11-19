"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ExternalLink, FolderKanban, Search, ShieldCheck } from "lucide-react";
import type {
  StudentProjectDirectoryQuery,
  StudentPortfolioEvidenceOrigin,
  StudentPortfolioVerificationState,
} from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { studentPortfolioApi } from "@/lib/student-portfolio";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";

type DirectoryFilters = {
  q: string;
  course: string;
  cohort: string;
  skill: string;
  origin: "" | StudentPortfolioEvidenceOrigin;
  verification: "" | StudentPortfolioVerificationState;
  year: string;
};

const EMPTY_FILTERS: DirectoryFilters = {
  q: "", course: "", cohort: "", skill: "", origin: "", verification: "", year: "",
};

const ORIGINS: Array<[StudentPortfolioEvidenceOrigin, string]> = [
  ["external_project", "Independent project"],
  ["course_assessment", "Course assessment"],
  ["final_project", "Final project"],
  ["internship", "Internship"],
  ["practicum", "Practicum"],
  ["competition", "Competition"],
  ["achievement", "Achievement"],
  ["other", "Other"],
];

function textLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

export function StudentProjectsDirectory() {
  const { me } = useMe();
  const [draft, setDraft] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<DirectoryFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const limit = 12;

  const params: StudentProjectDirectoryQuery = {
    q: applied.q,
    course: applied.course,
    cohort: applied.cohort,
    skill: applied.skill,
    origin: applied.origin || undefined,
    verification: applied.verification || undefined,
    year: applied.year ? Number(applied.year) : undefined,
    page,
    limit,
  };

  const directory = useQuery({
    queryKey: protectedQueryKey(
      { userId: me?.id ?? "pending" },
      "student-projects",
      JSON.stringify(params),
    ),
    queryFn: () => studentPortfolioApi.projectDirectory(params),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
    placeholderData: keepPreviousData,
  });

  const result = directory.data;
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / limit));

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ ...draft });
    setPage(1);
  }

  function reset() {
    setDraft({ ...EMPTY_FILTERS });
    setApplied({ ...EMPTY_FILTERS });
    setPage(1);
  }

  const fieldClass = "min-w-0 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-foreground">Publicly shared student projects</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This directory includes only public portfolios and project items that students chose to publish.
              Private submissions, grades, assessment comments and restricted academic evidence are excluded.
              Verification refers to a specific piece of evidence, not the student&apos;s overall ability.
            </p>
          </div>
        </div>
      </section>

      <form onSubmit={apply} className="rounded-xl border border-border bg-card p-4 md:p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <Search className="h-4 w-4" aria-hidden="true" />
          Find a project or student
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Search</span>
            <input className={fieldClass} value={draft.q} maxLength={120}
              placeholder="Project, student, keyword"
              onChange={(event) => setDraft((f) => ({ ...f, q: event.target.value }))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Course code</span>
            <input className={fieldClass} value={draft.course} maxLength={30}
              placeholder="e.g. TSA301"
              onChange={(event) => setDraft((f) => ({ ...f, course: event.target.value }))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Cohort code</span>
            <input className={fieldClass} value={draft.cohort} maxLength={60}
              placeholder="Cohort"
              onChange={(event) => setDraft((f) => ({ ...f, cohort: event.target.value }))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Technology / skill</span>
            <input className={fieldClass} value={draft.skill} maxLength={80}
              placeholder="Python, AI, web"
              onChange={(event) => setDraft((f) => ({ ...f, skill: event.target.value }))} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Project type</span>
            <select className={fieldClass} value={draft.origin}
              onChange={(event) => setDraft((f) => ({ ...f, origin: event.target.value as DirectoryFilters["origin"] }))}>
              <option value="">All types</option>
              {ORIGINS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Evidence verification</span>
            <select className={fieldClass} value={draft.verification}
              onChange={(event) => setDraft((f) => ({ ...f, verification: event.target.value as DirectoryFilters["verification"] }))}>
              <option value="">All statuses</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
              <option value="needs_changes">Needs changes</option>
              <option value="revoked">Revoked</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Project year</span>
            <input className={fieldClass} type="number" min={2000} max={2100}
              value={draft.year} placeholder="2026"
              onChange={(event) => setDraft((f) => ({ ...f, year: event.target.value }))} />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Apply filters
            </button>
            <button type="button" onClick={reset} className="rounded-lg border border-input px-4 py-2 text-sm font-semibold">
              Reset
            </button>
          </div>
        </div>
      </form>

      <section aria-live="polite" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Projects</h2>
          <p className="text-sm text-muted-foreground">
            {result ? `${result.total} matching project${result.total === 1 ? "" : "s"}` : "Loading projects…"}
          </p>
        </div>
        {directory.isError && !result ? (
          <div role="alert" className="rounded-xl border border-destructive/40 p-5 text-sm text-destructive">
            Could not load the directory: {directory.error instanceof Error ? directory.error.message : "Unknown error"}.
            <button className="ml-2 underline" type="button" onClick={() => void directory.refetch()}>Retry</button>
          </div>
        ) : directory.isPending && !result ? (
          <div role="status" className="rounded-xl border border-border p-8 text-sm text-muted-foreground">
            Loading publicly shared projects…
          </div>
        ) : !result || result.items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <FolderKanban className="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden="true" />
            <p className="font-semibold">No matching projects</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Students can publish selected projects from Student Portal → Portfolio. Try broader filters.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.items.map((item) => (
              <article key={item.evidenceId} className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-muted px-2 py-1 font-medium">{textLabel(item.origin)}</span>
                  {item.featured ? <span className="rounded-full bg-muted px-2 py-1">Featured</span> : null}
                  <span className="rounded-full border border-border px-2 py-1">{textLabel(item.verification)}</span>
                </div>
                <h3 className="mt-3 line-clamp-2 font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm font-medium text-muted-foreground">{item.studentName}</p>
                <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted-foreground">
                  {item.summary || "No project summary yet."}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {item.skills.slice(0, 6).map((skill) => (
                    <span key={skill} className="rounded-md bg-muted px-2 py-1 text-xs">{skill}</span>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  {[item.courseCode, item.cohortCode, String(item.projectYear)].filter(Boolean).join(" · ")}
                  {item.term ? ` · ${item.term}` : ""}
                </p>
                <Link href={`/portfolio/${item.publicSlug}`} target="_blank" rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Open published portfolio <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        )}
        {result && result.total > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              Page {page} of {pageCount}{directory.isFetching ? " · Refreshing…" : ""}
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1 || directory.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-input px-3 py-2 text-sm font-medium disabled:opacity-50">Previous</button>
              <button type="button" disabled={page >= pageCount || directory.isFetching}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-input px-3 py-2 text-sm font-medium disabled:opacity-50">Next</button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
