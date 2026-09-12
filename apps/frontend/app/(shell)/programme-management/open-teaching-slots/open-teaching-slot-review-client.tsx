"use client";

import type { OpenTeachingSlotClaimView } from "@dse-pms/shared-types";
import { useCallback, useEffect, useState } from "react";
import { openTeachingSlotApi } from "@/lib/open-teaching-slots";

function formatSlotDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "Asia/Phnom_Penh",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

export function OpenTeachingSlotReviewClient() {
  const [claims, setClaims] = useState<OpenTeachingSlotClaimView[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setClaims(await openTeachingSlotApi.reviewQueue());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load open-slot review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function review(claim: OpenTeachingSlotClaimView, decision: "APPROVE" | "REJECT") {
    setBusy(claim.id);
    setError("");
    try {
      await openTeachingSlotApi.review(claim.id, {
        decision,
        comment: comments[claim.id]?.trim() || undefined,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not review this claim");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading open-slot claims…</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="font-semibold">Review boundary</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Approval assigns the released time and room to the claimant&apos;s selected course and creates a separate exact teaching-session occurrence.
          The original cancelled session remains historical and is not marked as recovered or delivered.
        </p>
      </section>

      {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Programme queue</p>
          <h2 className="text-xl font-semibold">Pending slot claims</h2>
        </div>
        <span className="text-sm text-muted-foreground">{claims.length} pending</span>
      </div>

      {claims.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No open teaching slot claims are waiting for review.</div>
      ) : claims.map((claim) => (
        <article key={claim.id} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Released slot</p>
              <p className="mt-1 font-semibold">{claim.slot.sourceCourseCode} · {claim.slot.sourceCourseTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatSlotDate(claim.slot.sessionDate)} · {claim.slot.startTime}–{claim.slot.endTime} · {claim.slot.room ? `Room ${claim.slot.room}` : "Room not set"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Class {claim.slot.sectionCode}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requested use</p>
              <p className="mt-1 font-semibold">{claim.targetOffering.courseCode} · {claim.targetOffering.courseTitle}</p>
              <p className="mt-1 text-sm text-muted-foreground">Claimed by {claim.claimant.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">Class {claim.targetOffering.sectionCode} · {claim.targetOffering.term}</p>
            </div>
          </div>

          <label className="mt-4 grid gap-1.5 text-sm font-medium">
            Reviewer note <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea
              value={comments[claim.id] ?? ""}
              maxLength={1500}
              onChange={(event) => setComments((current) => ({ ...current, [claim.id]: event.target.value }))}
              className="min-h-24 rounded-xl border bg-background p-3 text-sm"
              placeholder="Add a short operational note for the lecturer"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === claim.id}
              onClick={() => void review(claim, "APPROVE")}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy === claim.id ? "Saving…" : "Approve slot assignment"}
            </button>
            <button
              type="button"
              disabled={busy === claim.id}
              onClick={() => void review(claim, "REJECT")}
              className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
