"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupervisorDiscoveryProfileView, UpdateSupervisorProfileInput } from "@dse-pms/shared-types";
import { api } from "@/lib/api";

const PROGRAMME_ID = "dse";

const fieldClassName =
  "w-full rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";

export default function MySupervisorProfilePage() {
  const [statement, setStatement] = useState("");
  const [capacity, setCapacity] = useState(3);
  const [acceptingStudents, setAcceptingStudents] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [tracksText, setTracksText] = useState("");
  const [ideasText, setIdeasText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<SupervisorDiscoveryProfileView | null>(`/api/final-project/supervisor-profile/me?programmeId=${PROGRAMME_ID}`)
      .then((profile) => {
        if (!profile) return;
        setStatement(profile.supervisionStatement);
        setCapacity(profile.capacity);
        setAcceptingStudents(profile.acceptingStudents);
        setIsPublished(profile.isPublished);
        setTracksText(profile.tracks.map((track) => `${track.name}${track.description ? ` | ${track.description}` : ""}`).join("\n"));
        setIdeasText(profile.projectIdeas.map((idea) => `${idea.title} | ${idea.trackName} | ${idea.summary}`).join("\n"));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const tracks = tracksText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name = "", description = ""] = line.split("|").map((part) => part.trim());
      return { name, description };
    });
    const projectIdeas = ideasText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [title = "", trackName = "", summary = ""] = line.split("|").map((part) => part.trim());
      return { title, trackName, summary };
    });
    const body: UpdateSupervisorProfileInput = {
      programmeId: PROGRAMME_ID,
      supervisionStatement: statement,
      capacity,
      acceptingStudents,
      isPublished,
      tracks,
      projectIdeas,
    };
    try {
      await api.put<SupervisorDiscoveryProfileView>("/api/final-project/supervisor-profile/me", body);
      setMessage("Supervisor profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save supervisor profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
      <header>
        <p className="text-sm font-medium text-primary">Year 4 Final Project</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">My Supervisor Profile</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-secondary">
          Publish only the short information students need to understand your supervision areas. Your main Lecturer Portfolio remains the source for professional evidence.
        </p>
      </header>

      <form onSubmit={save} className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Supervision statement</span>
          <textarea
            className={`${fieldClassName} min-h-32 p-3`}
            maxLength={1500}
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            placeholder="What kinds of Final Projects do you want to supervise? What should students expect from you?"
          />
          <span className="block text-right text-xs text-muted-foreground">{statement.length}/1500</span>
        </label>

        <div className="grid gap-4 border-y border-border py-5 sm:grid-cols-[minmax(8rem,10rem)_1fr_1fr] sm:items-end">
          <label className="space-y-2">
            <span className="text-sm font-medium text-foreground">Capacity</span>
            <input
              className={`${fieldClassName} min-h-11 px-3`}
              type="number"
              min={0}
              max={50}
              value={capacity}
              onChange={(event) => setCapacity(Number(event.target.value))}
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 text-sm font-medium text-foreground-secondary">
            <input
              className="h-4 w-4 accent-primary"
              type="checkbox"
              checked={acceptingStudents}
              onChange={(event) => setAcceptingStudents(event.target.checked)}
            />
            Accepting students
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-1 text-sm font-medium text-foreground-secondary">
            <input
              className="h-4 w-4 accent-primary"
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
            />
            Publish to students
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Research / project tracks</span>
          <p className="text-xs text-muted-foreground">One per line: <code className="text-foreground-secondary">Track name | Short description</code></p>
          <textarea
            className={`${fieldClassName} min-h-32 p-3 font-mono`}
            value={tracksText}
            onChange={(event) => setTracksText(event.target.value)}
            placeholder={"AI for Agriculture | Computer vision and decision support\nAI for Education | Learning analytics and academic systems"}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-foreground">Example project ideas</span>
          <p className="text-xs text-muted-foreground">One per line: <code className="text-foreground-secondary">Project title | Track name | Short summary</code></p>
          <textarea
            className={`${fieldClassName} min-h-36 p-3 font-mono`}
            value={ideasText}
            onChange={(event) => setIdeasText(event.target.value)}
            placeholder="Crop disease detection | AI for Agriculture | Build and evaluate a practical image-based system"
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-xl border border-error/30 bg-error-bg p-3 text-sm text-error">{error}</p>
        ) : null}
        {message ? (
          <p role="status" className="rounded-xl border border-success/30 bg-success-bg p-3 text-sm text-success">{message}</p>
        ) : null}

        <div className="flex justify-end border-t border-border pt-5">
          <button
            disabled={saving}
            className="min-h-11 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
          >
            {saving ? "Saving…" : "Save supervisor profile"}
          </button>
        </div>
      </form>
    </main>
  );
}
