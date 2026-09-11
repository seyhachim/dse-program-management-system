"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupervisorDiscoveryProfileView, UpdateSupervisorProfileInput } from "@dse-pms/shared-types";
import { api } from "@/lib/api";

const PROGRAMME_ID = "dse";

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
        <p className="text-sm font-medium text-slate-500">Year 4 Final Project</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">My Supervisor Profile</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">Publish only the short information students need to understand your supervision areas. Your main Lecturer Portfolio remains the source for professional evidence.</p>
      </header>

      <form onSubmit={save} className="space-y-5 rounded-2xl border bg-white p-5 sm:p-6">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-800">Supervision statement</span>
          <textarea className="min-h-32 w-full rounded-xl border p-3 text-sm" maxLength={1500} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="What kinds of Final Projects do you want to supervise? What should students expect from you?" />
          <span className="block text-right text-xs text-slate-400">{statement.length}/1500</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-medium text-slate-800">Capacity</span>
            <input className="min-h-11 w-full rounded-xl border px-3 text-sm" type="number" min={0} max={50} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} />
          </label>
          <label className="flex min-h-11 items-center gap-2 pt-7 text-sm text-slate-700">
            <input type="checkbox" checked={acceptingStudents} onChange={(event) => setAcceptingStudents(event.target.checked)} />
            Accepting students
          </label>
          <label className="flex min-h-11 items-center gap-2 pt-7 text-sm text-slate-700">
            <input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} />
            Publish to students
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-800">Research / project tracks</span>
          <p className="text-xs text-slate-500">One per line: <code>Track name | Short description</code></p>
          <textarea className="min-h-32 w-full rounded-xl border p-3 font-mono text-sm" value={tracksText} onChange={(event) => setTracksText(event.target.value)} placeholder={"AI for Agriculture | Computer vision and decision support\nAI for Education | Learning analytics and academic systems"} />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-800">Example project ideas</span>
          <p className="text-xs text-slate-500">One per line: <code>Project title | Track name | Short summary</code></p>
          <textarea className="min-h-36 w-full rounded-xl border p-3 font-mono text-sm" value={ideasText} onChange={(event) => setIdeasText(event.target.value)} placeholder="Crop disease detection | AI for Agriculture | Build and evaluate a practical image-based system" />
        </label>

        {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}

        <div className="flex justify-end">
          <button disabled={saving} className="min-h-11 rounded-xl bg-slate-950 px-5 text-sm font-medium text-white disabled:opacity-50" type="submit">
            {saving ? "Saving…" : "Save supervisor profile"}
          </button>
        </div>
      </form>
    </main>
  );
}
