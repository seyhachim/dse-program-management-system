"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Bookmark, CalendarDays, Filter, GraduationCap, Search } from "lucide-react";
import type { OpportunityKind } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { opportunitiesApi } from "@/lib/opportunities";
import { protectedQueryKey } from "@/lib/query-client";

const filters: Array<{ value: OpportunityKind | "all"; label: string }> = [
  { value: "all", label: "All" }, { value: "scholarship", label: "Scholarships" },
  { value: "hackathon", label: "Hackathons" }, { value: "competition", label: "Competitions" },
  { value: "internship", label: "Internships" }, { value: "exchange", label: "Exchange" },
  { value: "research", label: "Research" }, { value: "training", label: "Training" },
];

function formatDeadline(day: string | null) {
  if (!day) return "Deadline not specified";
  return "Deadline " + new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });
}

export function OpportunitiesClient() {
  const { me, loading } = useMe();
  const [category, setCategory] = useState<OpportunityKind | "all">("all");
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: protectedQueryKey({ userId: me?.id ?? "pending" }, "opportunities", "published"),
    queryFn: opportunitiesApi.list,
    enabled: Boolean(me?.id),
    staleTime: 60_000,
  });
  const rows = useMemo(() => (query.data ?? []).filter((row) =>
    (category === "all" || row.type === category)
    && (row.title + " " + row.organizer + " " + row.summary).toLowerCase().includes(search.trim().toLowerCase())
  ), [query.data, category, search]);
  const staff = me?.roles.some((role) => role === "admin" || role === "program_coordinator");

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Discover your next opportunity</h1>
          <p className="text-sm text-muted-foreground">Official application pages remain the source of truth. Check eligibility before applying.</p>
        </div>
        {staff ? <Link href="/opportunities/manage" className="inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted">Manage opportunities</Link> : null}
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <label className="relative block">
          <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search opportunities</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search opportunities, organizers, or topics…" className="min-h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm" />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Opportunity categories">
          <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {filters.map((item) => (
            <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)}
              className={"min-h-10 rounded-full border px-3 py-1 text-sm " + (category === item.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {loading || query.isPending ? <p role="status" className="py-8 text-sm text-muted-foreground">Loading opportunities…</p>
      : query.isError ? <p role="alert" className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive">Could not load opportunities. Please try again.</p>
      : rows.length === 0 ? (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center">
          <GraduationCap className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-semibold">{query.data?.length ? "No matches" : "No active opportunities published yet"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Programme staff will publish verified opportunities here. You can also check your course announcements.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((item) => (
            <article key={item.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold capitalize text-primary">{item.type}</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" />{formatDeadline(item.deadline)}</span>
              </div>
              <div>
                <h2 className="break-words text-lg font-semibold leading-snug">{item.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{item.organizer}</p>
              </div>
              <p className="line-clamp-3 break-words text-sm leading-6">{item.summary}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">Eligibility: {item.eligibility}</p>
              <div className="mt-auto flex flex-wrap items-center gap-4 pt-2 text-sm">
                <Link href={"/opportunities/" + item.id} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline">View details <ArrowUpRight className="h-4 w-4" /></Link>
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 hover:underline">Official source <ArrowUpRight className="h-4 w-4" /></a>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="flex items-start gap-2 text-xs text-muted-foreground"><Bookmark className="h-4 w-4 shrink-0" /> Saved opportunities and deadline reminders will be added in a later phase; the external organizer controls applications.</p>
    </div>
  );
}
