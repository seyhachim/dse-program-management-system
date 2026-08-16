"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Plus, Users } from "lucide-react";
import type { CommunityDiscussionSummaryView, CommunityView } from "@dse-pms/shared-types";
import { communityApi } from "@/lib/community";

export function CommunityDetailClient({ communityId }: { communityId: string }) {
  const [community, setCommunity] = useState<CommunityView | null>(null);
  const [discussions, setDiscussions] = useState<CommunityDiscussionSummaryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", tags: "" });

  async function load() {
    setLoading(true);
    try {
      const [communityData, discussionData] = await Promise.all([
        communityApi.get(communityId),
        communityApi.discussions(communityId),
      ]);
      setCommunity(communityData);
      setDiscussions(discussionData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load community");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [communityId]);

  async function createDiscussion(event: React.FormEvent) {
    event.preventDefault();
    try {
      await communityApi.createDiscussion(communityId, {
        title: form.title,
        body: form.body,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      });
      setForm({ title: "", body: "", tags: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create discussion");
    }
  }

  async function join() {
    try {
      await communityApi.join(communityId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join community");
    }
  }

  if (loading) return <div className="mx-auto max-w-6xl p-8 text-sm text-muted-foreground">Loading community…</div>;
  if (!community) return <div className="mx-auto max-w-6xl p-8 text-sm text-destructive">{error || "Community not found"}</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <Link href="/community" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Community of Practice
      </Link>

      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">{community.category}</span>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{community.leadership.replace("Led", "-led")}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{community.name}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{community.description}</p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> {community.memberCount} members</span>
              <span className="inline-flex items-center gap-1.5"><MessageCircle className="h-4 w-4" /> {community.discussionCount} discussions</span>
            </div>
          </div>
          <div className="flex gap-2">
            {!community.isMember ? <button type="button" onClick={() => void join()} className="rounded-md border px-4 py-2 text-sm font-medium">Join</button> : null}
            <button type="button" onClick={() => setShowForm((value) => !value)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Plus className="h-4 w-4" /> New discussion
            </button>
          </div>
        </div>
      </section>

      {showForm ? (
        <form onSubmit={createDiscussion} className="space-y-4 rounded-xl border bg-card p-5">
          <div>
            <h2 className="font-semibold">Start a focused discussion</h2>
            <p className="text-sm text-muted-foreground">Use a real problem, practice, feedback finding, or improvement opportunity.</p>
          </div>
          <input required minLength={5} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Improving deployment skills for students" />
          <textarea required minLength={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Describe the problem and what you want the community to explore." />
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Tags separated by commas: Student feedback, Curriculum" />
          <div className="flex gap-2">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Post discussion</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      ) : null}

      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Active discussions</h2>
            <span className="text-xs text-muted-foreground">{discussions.length} total</span>
          </div>
          {discussions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No discussion yet. Start with a concrete problem the community can act on.</div>
          ) : discussions.map((discussion) => (
            <Link key={discussion.id} href={`/community/${communityId}/discussions/${discussion.id}`} className="block rounded-xl border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{discussion.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{discussion.body}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{discussion.status}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {discussion.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-1 text-xs">{tag}</span>)}
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Started by {discussion.authorName}</span>
                <span>{discussion.commentCount} comments</span>
                <span>{discussion.actionCount} linked actions</span>
              </div>
            </Link>
          ))}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold">How this community works</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• Students contribute experience and ideas.</li>
              <li>• Lecturers facilitate and connect learning practice.</li>
              <li>• Useful discussions become tracked actions.</li>
              <li>• Actions are evaluated before becoming programme practice.</li>
            </ul>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold">Recent impact</h2>
            <p className="mt-2 text-3xl font-bold">{community.implementedActionCount}</p>
            <p className="text-xs text-muted-foreground">actions have reached the evaluated stage.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
