"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { MakeUpClassView } from "@dse-pms/shared-types";
import { Topbar } from "../../topbar";
import { useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { makeUpClassApi } from "@/lib/make-up-class";
import { offeringsApi } from "@/lib/offerings";
import { protectedQueryKey } from "@/lib/query-client";

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "The request could not be completed";
}
function makeUpLabel(row: MakeUpClassView): string {
  return `${row.courseCode} · ${row.sectionCode} · original ${row.originalDate} → ${row.replacementDate} ${row.startTime}–${row.endTime}`;
}

export default function MakeUpClassPage() {
  const { me } = useMe();
  const scope = { userId: me?.id ?? "pending" };
  const reviewer = Boolean(me?.roles.some((role) => role === "admin" || role === "program_coordinator"));
  const offeringsQuery = useQuery({
    queryKey: protectedQueryKey(scope, "offerings", "make-up", "list"),
    queryFn: offeringsApi.list,
    enabled: Boolean(me?.id),
  });
  const mineQuery = useQuery({
    queryKey: protectedQueryKey(scope, "offerings", "make-up", "mine"),
    queryFn: makeUpClassApi.mine,
    enabled: Boolean(me?.id),
  });
  const queueQuery = useQuery({
    queryKey: protectedQueryKey(scope, "offerings", "make-up", "queue"),
    queryFn: makeUpClassApi.reviewQueue,
    enabled: Boolean(me?.id && reviewer),
  });

  const [offeringId, setOfferingId] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [originalDate, setOriginalDate] = useState("");
  const [replacementDate, setReplacementDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [room, setRoom] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewBusyId, setReviewBusyId] = useState("");
  const [verifiedId, setVerifiedId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  const offerings = useMemo(() => (offeringsQuery.data ?? []).filter((item) => item.meetings.length > 0), [offeringsQuery.data]);
  const selectedOffering = offerings.find((item) => item.id === offeringId);
  const meetings = selectedOffering?.meetings ?? [];

  async function refresh() {
    await Promise.all([mineQuery.refetch(), queueQuery.refetch()]);
  }

  async function propose(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setFeedback(""); setBusy(true);
    try {
      await makeUpClassApi.propose({
        offeringId, offeringMeetingId: meetingId,
        originalDate, replacementDate, startTime, endTime, room, note,
      });
      setFeedback("Make-up proposed. The programme must approve it before the class appears in Roll Call.");
      setNote("");
      await refresh();
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  async function decide(item: MakeUpClassView, decision: "APPROVE" | "REJECT") {
    setError(""); setFeedback(""); setReviewBusyId(item.id);
    try {
      await makeUpClassApi.review(item.id, {
        decision, ...(decision === "APPROVE" ? { confirmedMissed: verifiedId === item.id } : {}),
      });
      setFeedback(decision === "APPROVE"
        ? "Make-up approved. The lecturer can now select its actual date in Roll Call."
        : "Make-up request rejected.");
      setVerifiedId("");
      await refresh();
    } catch (reason) { setError(message(reason)); }
    finally { setReviewBusyId(""); }
  }

  return (
    <>
      <Topbar title="Make-up Classes" subtitle="Recover missed teaching through a reviewed replacement class, without changing the original timetable." />
      <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap gap-2">
          <Link href="/teaching-schedule" className="rounded-md border border-input px-3 py-2 text-sm">Teaching schedule</Link>
          <Link href="/attendance" className="rounded-md border border-input px-3 py-2 text-sm">Open Roll Call</Link>
        </div>
        {error && <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</div>}
        {feedback && <div role="status" className="rounded-lg border border-border p-3 text-sm">{feedback}</div>}

        <section className="rounded-xl border border-border bg-card p-4 md:p-6">
          <h2 className="text-lg font-semibold">Propose a make-up class</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose the original missed class and a replacement date. The replacement must fall within the teaching period
            and cannot be on another recurring day of this same section (one attendance register per section/date).
            Approval does not overwrite the original class.
          </p>
          <form onSubmit={(event) => void propose(event)} className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Course and section
              <select required value={offeringId} onChange={(event) => { setOfferingId(event.target.value); setMeetingId(""); }}
                className="h-10 rounded-md border border-input bg-background px-3">
                <option value="">Select a class</option>
                {offerings.map((o) => <option key={o.id} value={o.id}>{o.course?.code ?? "Course"} · {o.sectionCode} · {o.term}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Original recurring meeting
              <select required value={meetingId} onChange={(event) => setMeetingId(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3">
                <option value="">Select a timetable meeting</option>
                {meetings.map((m) => <option key={m.id} value={m.id}>{m.dayOfWeek} · {m.startTime}–{m.endTime}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Original missed date
              <input required type="date" value={originalDate} onChange={(event) => setOriginalDate(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3" />
            </label>
            <label className="grid gap-1 text-sm">New teaching date
              <input required type="date" value={replacementDate} onChange={(event) => setReplacementDate(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3" />
            </label>
            <label className="grid gap-1 text-sm">Start time
              <input required type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3" />
            </label>
            <label className="grid gap-1 text-sm">End time
              <input required type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3" />
            </label>
            <label className="grid gap-1 text-sm">Room (optional)
              <input value={room} maxLength={100} onChange={(event) => setRoom(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3" placeholder="Use original room if blank" />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">Reason and teaching recovery plan
              <textarea required minLength={1} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)}
                className="min-h-20 rounded-md border border-input bg-background p-3"
                placeholder="Why was the class missed and what will be covered?" />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy || !offeringId || !meetingId}
                className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50">
                {busy ? "Submitting…" : "Request programme approval"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">My make-up requests</h2>
          {mineQuery.isLoading && <p className="mt-3 text-sm">Loading…</p>}
          {mineQuery.isError && <p role="alert" className="mt-3 text-sm text-destructive">{message(mineQuery.error)}</p>}
          {mineQuery.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No requests yet.</p>}
          <div className="mt-3 space-y-3">
            {mineQuery.data?.map((item) => <div key={item.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{makeUpLabel(item)}</p>
              <p className="mt-1 text-muted-foreground">Status: {item.status}{item.room ? ` · ${item.room}` : ""}</p>
              {item.status === "APPROVED" && <p className="mt-1">On the replacement date, select this section in <Link href="/attendance" className="underline">Roll Call</Link>.</p>}
              {item.reviewNote && <p className="mt-1">Reviewer note: {item.reviewNote}</p>}
            </div>)}
          </div>
        </section>

        {reviewer && <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Programme review queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Verify the original class genuinely needs recovery before approving; missing attendance alone is not proof of cancellation.
          </p>
          {queueQuery.isLoading && <p className="mt-3 text-sm">Loading…</p>}
          {queueQuery.isError && <p role="alert" className="mt-3 text-sm text-destructive">{message(queueQuery.error)}</p>}
          {queueQuery.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No pending requests you can review.</p>}
          <div className="mt-3 space-y-4">
            {queueQuery.data?.map((item) => <div key={item.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">{makeUpLabel(item)}</p>
              <p className="mt-2 whitespace-pre-wrap">{item.note}</p>
              <label className="mt-3 flex items-start gap-2">
                <input type="checkbox" checked={verifiedId === item.id}
                  onChange={(e) => setVerifiedId(e.target.checked ? item.id : "")} />
                <span>I have verified the original session needs recovery and the replacement is appropriate.</span>
              </label>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={reviewBusyId === item.id || verifiedId !== item.id}
                  onClick={() => void decide(item, "APPROVE")}
                  className="rounded-md bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">Approve</button>
                <button type="button" disabled={reviewBusyId === item.id}
                  onClick={() => void decide(item, "REJECT")}
                  className="rounded-md border border-input px-3 py-2 disabled:opacity-50">Reject</button>
              </div>
            </div>)}
          </div>
        </section>}
      </main>
    </>
  );
}
