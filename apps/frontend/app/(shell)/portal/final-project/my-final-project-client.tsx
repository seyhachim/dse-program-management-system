"use client";

import { useCallback, useEffect, useState } from "react";
import type { GraduationProjectDetail } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { graduationProjectsApi } from "@/lib/graduation-projects";

export function MyFinalProjectClient() {
  const [projects, setProjects] = useState<GraduationProjectDetail[]>([]);
  const [artifactUrls, setArtifactUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const mine = await graduationProjectsApi.mine();
      setProjects(await Promise.all(mine.map((project) => graduationProjectsApi.get(project.id))));
    } catch (err) { setError(err instanceof ApiError ? err.message : "Failed to load your final project"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(milestoneId: string) {
    const artifactUrl = artifactUrls[milestoneId]?.trim();
    if (!artifactUrl) return;
    try {
      await graduationProjectsApi.submit(milestoneId, { artifactUrl, notes: "" });
      setArtifactUrls((current) => ({ ...current, [milestoneId]: "" }));
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Failed to submit milestone"); }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading your final project…</p>;
  if (!projects.length) return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No final project has been assigned to you yet.</div>;

  return <div className="space-y-6">
    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    {projects.map((project) => <article key={project.id} className="space-y-5 rounded-xl border bg-card p-5">
      <div><h2 className="text-lg font-semibold">{project.title}</h2><p className="mt-1 text-sm text-muted-foreground">{project.members.map((member) => `${member.studentNumber} · ${member.studentName}`).join(" · ")}</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Advisor</div><p className="mt-1 text-sm">{project.advisors.filter((advisor) => !advisor.endedAt).map((advisor) => `${advisor.role}: ${advisor.lecturerName}`).join(" · ") || "Not assigned"}</p></div>
        <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Path</div><p className="mt-1 text-sm">{project.phases.map((phase) => `${phase.kind} · ${phase.term}`).join(" → ") || "Not linked yet"}</p></div>
      </div>
      <section><h3 className="font-medium">Milestones</h3><div className="mt-3 space-y-3">{project.milestones.length === 0 ? <p className="text-sm text-muted-foreground">No milestones published yet.</p> : project.milestones.map((milestone) => <div key={milestone.id} className="rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3"><div><div className="font-medium">{milestone.title}</div>{milestone.description && <p className="mt-1 text-sm text-muted-foreground">{milestone.description}</p>}</div><span className="rounded-full bg-muted px-2 py-1 text-xs">{milestone.status}</span></div>
        {milestone.submissions.map((submission) => <div key={submission.id} className="mt-3 rounded-md bg-muted/50 p-3 text-sm"><a className="font-medium underline" href={submission.artifactUrl} target="_blank" rel="noreferrer">Submission v{submission.version}</a><span className="text-muted-foreground"> · {new Date(submission.submittedAt).toLocaleString()}</span>{submission.reviews.map((review) => <div key={review.id} className="mt-2 border-l-2 pl-3"><span className="font-medium">{review.decision}</span>{review.comment ? ` · ${review.comment}` : ""}</div>)}</div>)}
        <div className="mt-3 flex gap-2"><input className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Document / repository URL" value={artifactUrls[milestone.id] ?? ""} onChange={(e) => setArtifactUrls((current) => ({ ...current, [milestone.id]: e.target.value }))} /><button type="button" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" onClick={() => void submit(milestone.id)}>Submit new version</button></div>
      </div>)}</div></section>
      {project.meetings.length > 0 && <section><h3 className="font-medium">Supervision history</h3><div className="mt-3 space-y-2">{project.meetings.map((meeting) => <div key={meeting.id} className="rounded-lg border p-3 text-sm"><div className="font-medium">{new Date(meeting.occurredAt).toLocaleString()} · {meeting.createdByName}</div>{meeting.discussion && <p className="mt-1 text-muted-foreground">{meeting.discussion}</p>}{meeting.nextActions && <p className="mt-1"><span className="font-medium">Next:</span> {meeting.nextActions}</p>}</div>)}</div></section>}
    </article>)}
  </div>;
}
