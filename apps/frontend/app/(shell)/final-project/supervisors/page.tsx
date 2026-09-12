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
    const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
    if (acceptingOnly) params.set("accepting", "true");
    api.get<SupervisorDiscoveryProfileView[]>(`/api/final-project/supervisors?${params}`)
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [acceptingOnly]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      item.lecturerName.toLowerCase().includes(q)
      || item.supervisionStatement.toLowerCase().includes(q)
      || item.tracks.some((track) => track.name.toLowerCase().includes(q)),
    );
  }, [items, search]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-slate-500">Year 4 Final Project</p>
        <h1 className="text-2xl font-semibold text-slate-950">Find a Supervisor</h1>
        <p className="max-w-2xl text-sm text-slate-600">Explore published supervision areas and example project ideas before discussing your Final Project direction.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center">
        <input
          className="min-h-11 flex-1 rounded-xl border px-3 text-sm"
          placeholder="Search lecturer, research area, or keyword"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={acceptingOnly} onChange={(event) => setAcceptingOnly(event.target.checked)} />
          Accepting students only
        </label>
      </section>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading supervisors…</p> : null}

      {!loading && filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500">No published supervisors match these filters yet.</div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((supervisor) => (
          <article key={supervisor.id} className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-950">{supervisor.lecturerName}</h2>
                  <p className="text-sm text-slate-500">{supervisor.lecturerTitle ?? supervisor.qualification ?? "Lecturer"}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${supervisor.acceptingStudents ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {supervisor.acceptingStudents ? "Accepting" : "Not accepting"}
                </span>
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-slate-600">{supervisor.supervisionStatement || "Supervisor statement coming soon."}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {supervisor.tracks.slice(0, 5).map((track) => (
                <span key={track.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{track.name}</span>
              ))}
            </div>

            <div className="mt-auto flex items-center justify-between border-t pt-4 text-sm">
              <span className="text-slate-500">Capacity: {supervisor.capacity}</span>
              <Link className="font-medium text-blue-700 hover:underline" href={`/final-project/supervisors/${supervisor.lecturerId}?programmeId=${PROGRAMME_ID}`}>
                View profile →
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
