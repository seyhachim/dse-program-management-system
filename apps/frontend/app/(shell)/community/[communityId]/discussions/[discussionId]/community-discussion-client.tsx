"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, MessageCircle, Plus, UserRound } from "lucide-react";
import type { CommunityActionStatus, CommunityDiscussionDetailView } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { communityApi } from "@/lib/community";

const stages: CommunityActionStatus[] = ["Proposed", "Agreed", "Implementing", "Evaluated"];

export function CommunityDiscussionClient({ communityId, discussionId }: { communityId: string; discussionId: string }) {
  const { me } = useMe();
  const [discussion, setDiscussion] = useState<CommunityDiscussionDetailView | null>(null);
  const [comment, setComment] = useState("");
  const [actionSummary, setActionSummary] = useState("");
  const [showAction, setShowAction] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const canFacilitate = Boolean(me?.roles.some((role) => ["admin", "program_coordinator", "lecturer", "qa_contributor"].includes(role)));

  async function load() {
    try {
      setDiscussion(await communityApi.discussion(discussionId));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load discussion");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [discussionId]);

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!comment.trim()) return;
    try {
      await communityApi.comment(discussionId, comment.trim());
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment");
    }
  }

  async function submitAction(event: React.FormEvent) {
    event.preventDefault();
    try {
      await communityApi.createAction(discussionId, { summary: actionSummary.trim() });
      setActionSummary("");
      setShowAction(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create action");
    }
  }

  async function advance(actionId: string, current: CommunityActionStatus) {
    const index = stages.indexOf(current);
    if (index < 0 || index === stages.length - 1) return;
    try {
      await communityApi.updateActionStatus(actionId, stages[index + 1]!);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update action");
    }
  }

  if (loading) return <div className="mx-auto max-w-6xl p-8 text-sm text-muted-foreground">Loading discussion…</div>;
  if (!discussion) return <div className="mx-auto max-w-6xl p-8 text-sm text-destructive">{error || "Discussion not found"}</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Link href={`/community/${communityId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to community
      </Link>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              {discussion.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs">{tag}</span>)}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">{discussion.title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{discussion.body}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>Started by {discussion.authorName}</span>
              <span>{discussion.commentCount} comments</span>
              <span>{discussion.actionCount} linked actions</span>
            </div>
          </div>
          <span className="w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{discussion.status}</span>
        </div>
      </section>

      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <form onSubmit={submitComment} className="rounded-xl border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-muted p-2"><UserRound className="h-4 w-4" /></div>
              <div className="flex-1 space-y-3">
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Share your experience, evidence, idea, or suggestion…" />
                <div className="flex justify-end"><button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Post comment</button></div>
              </div>
            </div>
          </form>

          <div className="space-y-3">
            {discussion.comments.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No comments yet. Students and staff can contribute to the same discussion.</div>
            ) : discussion.comments.map((item) => (
              <article key={item.id} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-muted p-2"><UserRound className="h-4 w-4" /></div>
                  <div><div className="text-sm font-semibold">{item.authorName}</div><div className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div></div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Outcome tracker</h2>
                <p className="text-xs text-muted-foreground">Turn useful discussion into measurable action.</p>
              </div>
              {canFacilitate ? <button type="button" onClick={() => setShowAction((value) => !value)} className="rounded-md border p-2" aria-label="Create action"><Plus className="h-4 w-4" /></button> : null}
            </div>

            {showAction ? (
              <form onSubmit={submitAction} className="mt-4 space-y-3">
                <textarea required minLength={5} value={actionSummary} onChange={(e) => setActionSummary(e.target.value)} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Agreed action to track…" />
                <button className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Convert to action</button>
              </form>
            ) : null}

            <div className="mt-4 space-y-3">
              {discussion.actions.length === 0 ? <p className="text-sm text-muted-foreground">No tracked action yet.</p> : discussion.actions.map((action) => (
                <div key={action.id} className="rounded-lg border p-3">
                  <div className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" /><p className="text-sm font-medium">{action.summary}</p></div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="rounded-full bg-muted px-2 py-1 text-xs">{action.status}</span>
                    {canFacilitate && action.status !== "Evaluated" ? <button type="button" onClick={() => void advance(action.id, action.status)} className="text-xs font-medium text-primary">Advance →</button> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold">Participation model</h2>
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-2"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>Students can discuss, share problems, and suggest improvements.</span></div>
              <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>Facilitators convert consensus into formal tracked actions.</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
