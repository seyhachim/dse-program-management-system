"use client";

import type {
  OpenTeachingSlotClaimView,
  OpenTeachingSlotView,
} from "@dse-pms/shared-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { openTeachingSlotApi } from "@/lib/open-teaching-slots";

function formatSlotDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "Asia/Phnom_Penh",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

export function OpenTeachingSlotBoardClient() {
  const [slots, setSlots] = useState<OpenTeachingSlotView[]>([]);
  const [claims, setClaims] = useState<OpenTeachingSlotClaimView[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [nextSlots, nextClaims] = await Promise.all([
        openTeachingSlotApi.board(),
        openTeachingSlotApi.mine(),
      ]);
      setSlots(nextSlots);
      setClaims(nextClaims);
      setSelected((current) => {
        const next = { ...current };
        for (const slot of nextSlots) {
          if (!next[slot.id] && slot.eligibleOfferings[0]) {
            next[slot.id] = slot.eligibleOfferings[0].offeringId;
          }
        }
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load open teaching slots");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const pendingBySlot = useMemo(
    () => new Map(
      claims
        .filter((claim) => claim.status === "REQUESTED" || claim.status === "APPROVED")
        .map((claim) => [claim.slotId, claim]),
    ),
    [claims],
  );

  async function claim(slot: OpenTeachingSlotView) {
    const targetOfferingId = selected[slot.id];
    if (!targetOfferingId) return;
    setBusy(slot.id);
    setError("");
    try {
      await openTeachingSlotApi.claim(slot.id, { targetOfferingId });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request this teaching slot");
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(claimId: string) {
    setBusy(claimId);
    setError("");
    try {
      await openTeachingSlotApi.withdraw(claimId);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not withdraw this claim");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading open teaching slots…</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-semibold">How this works</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          A released slot is the original class time and room made available after approved teaching leave.
          Claiming it schedules another course you teach to the same class. It does not recover or overwrite the original missed course session.
        </p>
      </section>

      {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      <section className="space-y-3" aria-labelledby="open-slot-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Available now</p>
            <h2 id="open-slot-heading" className="text-xl font-semibold">Open teaching slots</h2>
          </div>
          <span className="text-sm text-muted-foreground">{slots.length} available</span>
        </div>

        {slots.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No released teaching slots currently match a course you teach to the same class.
          </div>
        ) : slots.map((slot) => {
          const existing = pendingBySlot.get(slot.id);
          return (
            <article key={slot.id} className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {formatSlotDate(slot.sessionDate)} · {slot.startTime}–{slot.endTime}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold">{slot.sourceCourseCode} · {slot.sourceCourseTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Class {slot.sectionCode} · {slot.room ? `Room ${slot.room}` : "Room not set"} · {slot.activityType}
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Released slot</span>
              </div>

              {existing ? (
                <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm">
                  <p className="font-semibold">
                    {existing.status === "APPROVED" ? "Assigned to your course" : "Claim awaiting programme review"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {existing.targetOffering.courseCode} · {existing.targetOffering.courseTitle}
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className="grid gap-1.5 text-sm font-medium">
                    Use this time for
                    <select
                      value={selected[slot.id] ?? ""}
                      onChange={(event) => setSelected((current) => ({ ...current, [slot.id]: event.target.value }))}
                      className="min-h-11 rounded-xl border bg-background px-3 text-sm"
                    >
                      {slot.eligibleOfferings.map((offering) => (
                        <option key={offering.offeringId} value={offering.offeringId}>
                          {offering.courseCode} · {offering.courseTitle}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy === slot.id || !selected[slot.id]}
                    onClick={() => void claim(slot)}
                    className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {busy === slot.id ? "Submitting…" : "Request this slot"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="space-y-3" aria-labelledby="my-slot-claims-heading">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">My requests</p>
          <h2 id="my-slot-claims-heading" className="text-xl font-semibold">Open-slot claim history</h2>
        </div>
        {claims.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">You have not requested an open teaching slot yet.</p>
        ) : claims.map((claim) => (
          <article key={claim.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{claim.targetOffering.courseCode} · {claim.targetOffering.courseTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatSlotDate(claim.slot.sessionDate)} · {claim.slot.startTime}–{claim.slot.endTime} · {claim.slot.room ? `Room ${claim.slot.room}` : "Room not set"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Released from {claim.slot.sourceCourseCode} · {claim.slot.sourceCourseTitle}; this is not recorded as recovery of that course.
                </p>
                {claim.reviewComment ? <p className="mt-2 text-sm">Reviewer note: {claim.reviewComment}</p> : null}
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{claim.status.replaceAll("_", " ")}</span>
            </div>
            {claim.status === "REQUESTED" ? (
              <button
                type="button"
                disabled={busy === claim.id}
                onClick={() => void withdraw(claim.id)}
                className="mt-3 min-h-10 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50"
              >
                {busy === claim.id ? "Withdrawing…" : "Withdraw request"}
              </button>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
