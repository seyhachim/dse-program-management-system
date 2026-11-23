"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/lib/auth";
import { opportunitiesApi } from "@/lib/opportunities";
import { protectedQueryKey } from "@/lib/query-client";

export function ParticipationClient() {
  const { me, loading } = useMe();
  const canView = Boolean(me?.roles.some((role) =>
    role === "lecturer" || role === "admin" || role === "program_coordinator"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: protectedQueryKey({ userId: me?.id ?? "pending" }, "opportunities", "participation"),
    queryFn: opportunitiesApi.interestOverview,
    enabled: Boolean(me?.id && canView),
    staleTime: 30_000,
  });
  const students = useQuery({
    queryKey: protectedQueryKey({ userId: me?.id ?? "pending" }, "opportunities", "participation", selectedId ?? ""),
    queryFn: () => opportunitiesApi.interestStudents(selectedId!),
    enabled: Boolean(me?.id && canView && selectedId),
    staleTime: 15_000,
  });
  if (loading) return <p role="status">Checking lecturer access…</p>;
  if (!canView) return <p role="alert">Only authorized DSE lecturers and programme staff can view interested student names.</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">
      <Link href="/opportunities" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">← Student opportunities</Link>
      <section className="rounded-2xl border bg-card p-5">
        <h1 className="text-xl font-semibold">Interested students</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Restricted to authorized lecturers, coordinators and administrators in this programme.
          These students indicated an intention to join; organizer registration and attendance are not verified.
          Student names must not be shared with other students.
        </p>
        {overview.isPending ? <p role="status" className="mt-4 text-sm">Loading opportunities…</p>
          : overview.isError ? <p role="alert" className="mt-4 text-sm text-destructive">Could not load programme opportunities.</p>
          : !overview.data?.length ? <p className="mt-4 text-sm text-muted-foreground">No published or archived opportunities yet.</p>
          : <div className="mt-4 space-y-3">
              {overview.data.map((entry) => (
                <article key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                  <div>
                    <h2 className="font-semibold">{entry.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {entry.status} · {entry.deadline ?? "No confirmed deadline"}{entry.deadlineTime ? " " + entry.deadlineTime + " ICT" : ""}
                      {" · "}{entry.count} planning to join
                    </p>
                  </div>
                  <button type="button" aria-pressed={selectedId === entry.id}
                    onClick={() => setSelectedId(selectedId === entry.id ? null : entry.id)}
                    className="min-h-11 rounded-lg border px-4 text-sm font-medium hover:bg-muted">
                    {selectedId === entry.id ? "Hide names" : "View names"}
                  </button>
                </article>
              ))}
            </div>}
      </section>
      {selectedId ? <section className="rounded-2xl border bg-card p-5">
        <h2 className="text-lg font-semibold">Student participation list</h2>
        <p className="mt-1 text-xs text-muted-foreground">Year groups come from recorded academic progression; missing information is not guessed.</p>
        {students.isPending ? <p role="status" className="mt-4 text-sm">Loading students…</p>
          : students.isError ? <p role="alert" className="mt-4 text-sm text-destructive">Unable to load names. Check your programme permissions.</p>
          : !students.data?.length ? <p className="mt-4 text-sm text-muted-foreground">No students currently planning to join.</p>
          : <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[530px] text-left text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground">
                  <th className="py-3 pr-4">Student</th>
                  <th className="py-3 pr-4">Student ID</th>
                  <th className="py-3 pr-4">Year group</th>
                  <th className="py-3">Marked interest</th>
                </tr></thead>
                <tbody>{students.data.map((person, index) => (
                  <tr key={person.studentId ?? person.name + index} className="border-b last:border-b-0">
                    <td className="py-3 pr-4 font-medium">{person.name}</td>
                    <td className="py-3 pr-4">{person.studentId ?? "Not recorded"}</td>
                    <td className="py-3 pr-4">{person.yearGroup}</td>
                    <td className="py-3">{new Date(person.joinedAt).toLocaleDateString("en-GB", { timeZone: "Asia/Phnom_Penh", dateStyle: "medium" })}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>}
      </section> : null}
    </div>
  );
}
