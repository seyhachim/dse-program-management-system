"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { SupervisorDiscoveryProfileView } from "@dse-pms/shared-types";
import { api } from "@/lib/api";

export default function SupervisorProfilePage() {
  const params = useParams<{ lecturerId: string }>();
  const searchParams = useSearchParams();
  const programmeId = searchParams.get("programmeId") ?? "dse";
  const [profile, setProfile] = useState<SupervisorDiscoveryProfileView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<SupervisorDiscoveryProfileView>(
      `/api/final-project/supervisors/${encodeURIComponent(params.lecturerId)}?programmeId=${encodeURIComponent(programmeId)}`,
    ).then(setProfile).catch((err: Error) => setError(err.message));
  }, [params.lecturerId, programmeId]);

  if (error) return <main className="mx-auto max-w-4xl p-6"><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p></main>;
  if (!profile) return <main className="mx-auto max-w-4xl p-6 text-sm text-slate-500">Loading supervisor profile…</main>;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <Link href="/final-project/supervisors" className="text-sm font-medium text-blue-700 hover:underline">← Back to supervisors</Link>

      <header className="rounded-2xl border bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">Final Project Supervisor</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">{profile.lecturerName}</h1>
            <p className="text-sm text-slate-600">{profile.lecturerTitle ?? profile.qualification ?? "Lecturer"}</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-sm font-medium ${profile.acceptingStudents ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
            {profile.acceptingStudents ? "Accepting students" : "Not accepting students"}
          </span>
        </div>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{profile.supervisionStatement || "No supervision statement has been published yet."}</p>
      </header>

      <section className="rounded-2xl border bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-950">Research & project tracks</h2>
          <span className="text-sm text-slate-500">Capacity: {profile.capacity}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {profile.tracks.map((track) => (
            <div key={track.id} className="rounded-xl bg-slate-50 p-4">
              <h3 className="font-medium text-slate-900">{track.name}</h3>
              {track.description ? <p className="mt-1 text-sm text-slate-600">{track.description}</p> : null}
            </div>
          ))}
          {profile.tracks.length === 0 ? <p className="text-sm text-slate-500">No tracks published yet.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-slate-950">Example project ideas</h2>
        <div className="mt-4 space-y-3">
          {profile.projectIdeas.map((idea) => (
            <article key={idea.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-medium text-slate-900">{idea.title}</h3>
                {idea.trackName ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{idea.trackName}</span> : null}
              </div>
              {idea.summary ? <p className="mt-2 text-sm leading-6 text-slate-600">{idea.summary}</p> : null}
            </article>
          ))}
          {profile.projectIdeas.length === 0 ? <p className="text-sm text-slate-500">No example ideas published yet.</p> : null}
        </div>
      </section>

      <p className="text-xs text-slate-500">Current supervision load is not displayed until the PMS has authoritative advisor-assignment records. This page does not accept applications yet.</p>
    </main>
  );
}
