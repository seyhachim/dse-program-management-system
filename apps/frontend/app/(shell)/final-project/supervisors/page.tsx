"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SupervisorDiscoveryProfileView } from "@dse-pms/shared-types";
import { api } from "@/lib/api";

const PROGRAMME_ID = "dse";

export default function SupervisorDirectoryPage() {
  const [items, setItems] = useState<SupervisorDiscoveryProfileView[]>([]);
  const [search, setSearch] = useState("");
  const [acceptingOnly, setAcceptingOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
    api.get<SupervisorDiscoveryProfileView[]>(`/api/final-project/supervisors?${params}`)
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (acceptingOnly && !item.acceptingStudents) return false;
      if (!q) return true;
      return item.lecturerName.toLowerCase().includes(q)
        || item.supervisionStatement.toLowerCase().includes(q)
        || item.tracks.some((track) => track.name.toLowerCase().includes(q));
    });
  }, [acceptingOnly, items, search]);

  function resetFilters() {
    setSearch("");
    setAcceptingOnly(false);
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Year 4 Final Project</p>
        <h1 className="text-2xl font-semibold text-foreground">Find a Supervisor</h1>
        <p className="max-w-2xl text-sm text-foreground-secondary">
          Explore published supervision areas and example project ideas before discussing your Final Project direction.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
        <input
          type="search"
          aria-label="Search supervisors"
          className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          placeholder="Search lecturer, research area, or keyword"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm text-foreground-secondary">
          <input
            className="size-4 accent-primary"
            type="checkbox"
            checked={acceptingOnly}
            onChange={(event) => setAcceptingOnly(event.target.checked)}
          />
          Accepting students only
        </label>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl border border-error/30 bg-error-bg p-4 text-sm text-error">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">Loading supervisors…</p>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <h2 className="font-semibold text-foreground">Supervisor profiles are not published yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Published supervision areas and project ideas will appear here when lecturers make their profiles available.
          </p>
        </div>
      ) : null}

      {!loading && !error && items.length > 0 && filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <h2 className="font-semibold text-foreground">No supervisors match these filters</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Try a different keyword or show all published supervisors, including those who are not currently accepting students.
          </p>
          <button
            type="button"
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={resetFilters}
          >
            Show all supervisors
          </button>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Published supervisors">
        {filtered.map((supervisor) => (
          <article key={supervisor.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold text-foreground">{supervisor.lecturerName}</h2>
                  <p className="break-words text-sm text-muted-foreground">
                    {supervisor.lecturerTitle ?? supervisor.qualification ?? "Lecturer"}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${supervisor.acceptingStudents ? "bg-success-bg text-success" : "bg-inactive-bg text-inactive"}`}>
                  {supervisor.acceptingStudents ? "Accepting" : "Not accepting"}
                </span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-foreground-secondary">
                {supervisor.supervisionStatement || "Supervisor statement coming soon."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {supervisor.tracks.slice(0, 5).map((track) => (
                <span key={track.id} className="max-w-full break-words rounded-full bg-muted px-2.5 py-1 text-xs text-foreground-secondary">
                  {track.name}
                </span>
              ))}
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
              <span className="text-muted-foreground">Capacity: {supervisor.capacity}</span>
              <Link
                className="shrink-0 font-medium text-primary hover:text-primary-hover hover:underline"
                href={`/final-project/supervisors/${supervisor.lecturerId}?programmeId=${PROGRAMME_ID}`}
              >
                View profile →
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
