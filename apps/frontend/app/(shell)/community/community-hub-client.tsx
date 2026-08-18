"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, MessageCircle, Plus, Search, Sparkles, Users } from "lucide-react";
import type { CommunityLeadership, CommunityView } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { communityApi } from "@/lib/community";

const leadershipLabel: Record<CommunityLeadership, string> = {
  StudentLed: "Student-led",
  LecturerLed: "Lecturer-led",
  Mixed: "Mixed",
};

export function CommunityHubClient() {
  const { me } = useMe();
  const [communities, setCommunities] = useState<CommunityView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | CommunityLeadership>("All");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "Teaching & Learning",
    leadership: "Mixed" as CommunityLeadership,
  });

  const canCreate = Boolean(me?.roles.some((role) => ["admin", "program_coordinator", "lecturer"].includes(role)));

  async function load() {
    setLoading(true);
    try {
      setCommunities(await communityApi.list());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load communities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return communities.filter((community) => {
      const matchesFilter = filter === "All" || community.leadership === filter;
      const matchesQuery =
        !normalized ||
        community.name.toLowerCase().includes(normalized) ||
        community.description.toLowerCase().includes(normalized) ||
        community.category.toLowerCase().includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [communities, filter, query]);

  const stats = useMemo(() => ({
    communities: communities.length,
    members: communities.reduce((sum, item) => sum + item.memberCount, 0),
    discussions: communities.reduce((sum, item) => sum + item.discussionCount, 0),
    impact: communities.reduce((sum, item) => sum + item.implementedActionCount, 0),
  }), [communities]);

  async function submitCommunity(event: React.FormEvent) {
    event.preventDefault();
    try {
      await communityApi.create({ programmeId: "dse", ...form });
      setCreating(false);
      setForm({ name: "", description: "", category: "Teaching & Learning", leadership: "Mixed" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create community");
    }
  }

  async function join(communityId: string) {
    try {
      await communityApi.join(communityId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join community");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Programme learning community</p>
          <h1 className="text-3xl font-bold tracking-tight">Community of Practice</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Students, lecturers, alumni, and mentors can share practice, discuss real problems, and turn good ideas into measurable programme improvements.
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setCreating((value) => !value)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Create community
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Active communities" value={stats.communities} />
        <StatCard icon={Users} label="Community members" value={stats.members} />
        <StatCard icon={MessageCircle} label="Open discussions" value={stats.discussions} />
        <StatCard icon={Sparkles} label="Evaluated actions" value={stats.impact} />
      </div>

      {creating ? (
        <form onSubmit={submitCommunity} className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="font-semibold">Create a Community of Practice</h2>
            <p className="text-sm text-muted-foreground">Start with a clear purpose. Students can participate even when the community is staff-facilitated.</p>
          </div>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Name</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Machine Learning & MLOps" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Category</span>
            <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-md border bg-background px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Leadership</span>
            <select value={form.leadership} onChange={(e) => setForm({ ...form, leadership: e.target.value as CommunityLeadership })} className="w-full rounded-md border bg-background px-3 py-2">
              <option value="StudentLed">Student-led</option>
              <option value="LecturerLed">Lecturer-led</option>
              <option value="Mixed">Mixed</option>
            </select>
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Purpose</span>
            <textarea required minLength={10} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-24 w-full rounded-md border bg-background px-3 py-2" placeholder="What problem or practice will this community work on?" />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="rounded-md border px-4 py-2 text-sm">Cancel</button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm" placeholder="Search communities..." />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["All", "StudentLed", "LecturerLed", "Mixed"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${filter === item ? "bg-primary text-primary-foreground" : "border bg-background"}`}>
              {item === "All" ? "All" : leadershipLabel[item]}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      {loading ? (
        <div className="rounded-xl border p-8 text-sm text-muted-foreground">Loading communities…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No communities match yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create the first focused community around a real teaching, research, student, or industry problem.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((community) => (
            <article key={community.id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{leadershipLabel[community.leadership]}</span>
                  <h2 className="mt-3 text-xl font-semibold">{community.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{community.description}</p>
                </div>
                <div className="rounded-lg bg-muted p-3"><Users className="h-5 w-5" /></div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-center text-sm">
                <MiniStat value={community.memberCount} label="Members" />
                <MiniStat value={community.discussionCount} label="Discussions" />
                <MiniStat value={community.implementedActionCount} label="Impact" />
              </div>
              <div className="mt-5 flex gap-2">
                <Link href={`/community/${community.id}`} className="flex-1 rounded-md border px-3 py-2 text-center text-sm font-medium">View community</Link>
                {!community.isMember ? (
                  <button type="button" onClick={() => void join(community.id)} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Join</button>
                ) : (
                  <span className="flex-1 rounded-md bg-muted px-3 py-2 text-center text-sm font-medium">Joined</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></div><div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div></div></div>;
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return <div className="rounded-lg bg-muted/60 p-2"><div className="font-semibold">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}
