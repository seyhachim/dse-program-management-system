"use client";

import { useEffect, useState } from "react";
import type { ProgrammeSupervisorOverviewView } from "@dse-pms/shared-types";
import { api } from "@/lib/api";

const PROGRAMME_ID = "dse";

export default function SupervisorCapacityPage() {
  const [overview, setOverview] = useState<ProgrammeSupervisorOverviewView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<ProgrammeSupervisorOverviewView>(`/api/final-project/supervisor-overview?programmeId=${PROGRAMME_ID}`)
      .then(setOverview)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <main className="mx-auto max-w-6xl p-6"><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p></main>;
  if (!overview) return <main className="mx-auto max-w-6xl p-6 text-sm text-slate-500">Loading supervisor capacity…</main>;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-slate-500">Final Project · Programme view</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">Supervisor Capacity</h1>
        <p className="mt-2 text-sm text-slate-600">Discovery readiness only. Actual supervision load will come from the later authoritative advisor-assignment workflow.</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Published supervisors" value={overview.publishedSupervisors} />
        <Metric label="Accepting students" value={overview.acceptingSupervisors} />
        <Metric label="Declared capacity" value={overview.totalCapacity} />
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Supervisor</th>
                <th className="px-4 py-3">Tracks</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Accepting</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Current load</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {overview.supervisors.map((supervisor) => (
                <tr key={supervisor.id}>
                  <td className="px-4 py-4">
                    <p className="font-medium text-slate-900">{supervisor.lecturerName}</p>
                    <p className="text-xs text-slate-500">{supervisor.lecturerTitle ?? supervisor.qualification ?? "Lecturer"}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{supervisor.tracks.map((track) => track.name).join(", ") || "—"}</td>
                  <td className="px-4 py-4">{supervisor.isPublished ? "Yes" : "No"}</td>
                  <td className="px-4 py-4">{supervisor.acceptingStudents ? "Yes" : "No"}</td>
                  <td className="px-4 py-4 font-medium">{supervisor.capacity}</td>
                  <td className="px-4 py-4 text-slate-500">Not tracked yet</td>
                </tr>
              ))}
              {overview.supervisors.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No supervisor profiles have been created yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}
