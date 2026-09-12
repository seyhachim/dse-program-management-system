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
    setError("");
    api.get<SupervisorDiscoveryProfileView>(
      `/api/final-project/supervisors/${encodeURIComponent(params.lecturerId)}?programmeId=${encodeURIComponent(programmeId)}`,
    ).then(setProfile).catch((err: Error) => setError(err.message));
  }, [params.lecturerId, programmeId]);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p role="alert" className="rounded-xl border border-error/30 bg-error-bg p-4 text-sm text-error">{error}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p role="status" className="text-sm text-muted-foreground">Loading supervisor profile…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <Link href="/final-project/supervisors" className="text-sm font-medium text-primary hover:text-primary-hover hover:underline">
        ← Back to supervisors
      </Link>

      <header className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Final Project Supervisor</p>
            <h1 className="mt-1 break-words text-2xl font-semibold text-foreground">{profile.lecturerName}</h1>
            <p className="break-words text-sm text-foreground-secondary">
              {profile.lecturerTitle ?? profile.qualification ?? "Lecturer"}
            </p>
          </div>
          <span className={`w-fit shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${profile.acceptingStudents ? "bg-success-bg text-success" : "bg-inactive-bg text-inactive"}`}>
            {profile.acceptingStudents ? "Accepting students" : "Not accepting students"}
          </span>
        </div>
        <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-foreground-secondary">
          {profile.supervisionStatement || "No supervision statement has been published yet."}
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Research & project tracks</h2>
          <span className="text-sm text-muted-foreground">Capacity: {profile.capacity}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {profile.tracks.map((track) => (
            <div key={track.id} className="rounded-xl border border-border/70 bg-muted/50 p-4">
              <h3 className="break-words font-medium text-foreground">{track.name}</h3>
              {track.description ? (
                <p className="mt-1 break-words text-sm text-foreground-secondary">{track.description}</p>
              ) : null}
            </div>
          ))}
          {profile.tracks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center sm:col-span-2">
              <p className="text-sm font-medium text-foreground">No research or project tracks have been published yet</p>
              <p className="mt-1 text-sm text-muted-foreground">This supervisor can add areas of interest from their supervisor profile.</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Example project ideas</h2>
        <div className="mt-4 space-y-3">
          {profile.projectIdeas.map((idea) => (
            <article key={idea.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 break-words font-medium text-foreground">{idea.title}</h3>
                {idea.trackName ? (
                  <span className="max-w-full break-words rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{idea.trackName}</span>
                ) : null}
              </div>
              {idea.summary ? <p className="mt-2 break-words text-sm leading-6 text-foreground-secondary">{idea.summary}</p> : null}
            </article>
          ))}
          {profile.projectIdeas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
              <p className="text-sm font-medium text-foreground">No example project ideas have been published yet</p>
              <p className="mt-1 text-sm text-muted-foreground">You can still discuss a project direction that fits the supervisor's published interests.</p>
            </div>
          ) : null}
        </div>
      </section>

      <p className="text-xs leading-5 text-muted-foreground">
        Current supervision load is not displayed until the PMS has authoritative advisor-assignment records. This page does not accept applications yet.
      </p>
    </main>
  );
}
