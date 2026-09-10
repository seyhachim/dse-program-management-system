"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RequestOfferingActivationExceptionInputSchema,
  ReviewOfferingActivationExceptionInputSchema,
  RevokeOfferingActivationExceptionInputSchema,
  type OfferingActivationExceptionMissingItem,
  type OfferingActivationExceptionSnapshot,
} from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock3, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { offeringActivationExceptionsApi } from "@/lib/offering-activation-exceptions";

function missingLabel(item: OfferingActivationExceptionMissingItem): string {
  return item === "CURRICULUM" ? "Curriculum confirmation" : "Approved CourseSpec";
}

function statusLabel(status: string): string {
  if (status === "APPROVED") return "Active · Documentation pending";
  if (status === "PENDING") return "Exception awaiting review";
  if (status === "REJECTED") return "Exception rejected";
  if (status === "RESOLVED") return "Documentation completed";
  if (status === "REVOKED") return "Exception revoked";
  if (status === "EXPIRED") return "Exception expired";
  return status;
}

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Could not update the activation exception";
}

export function OfferingActivationExceptionPanel({ offeringId }: { offeringId: string }) {
  const { me } = useMe();
  const [snapshot, setSnapshot] = useState<OfferingActivationExceptionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [revokeReason, setRevokeReason] = useState("");

  const reviewer = Boolean(
    me?.roles.includes("admin") || me?.roles.includes("program_coordinator"),
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void offeringActivationExceptionsApi
      .get(offeringId)
      .then((next) => {
        if (!cancelled) setSnapshot(next);
      })
      .catch((loadError) => {
        if (!cancelled) setError(message(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offeringId]);

  const minimumDueDate = useMemo(() => {
    if (!snapshot) return "";
    const today = new Date().toISOString().slice(0, 10);
    return snapshot.readiness.teachingStart > today
      ? snapshot.readiness.teachingStart
      : today;
  }, [snapshot]);

  if (!loading && snapshot && !snapshot.current && !snapshot.latest && snapshot.readiness.normalReady) {
    return null;
  }

  async function run(
    operation: () => Promise<OfferingActivationExceptionSnapshot>,
    reloadOffering = false,
  ) {
    setBusy(true);
    setError(null);
    try {
      const next = await operation();
      setSnapshot(next);
      if (reloadOffering) window.location.reload();
    } catch (operationError) {
      setError(message(operationError));
    } finally {
      setBusy(false);
    }
  }

  async function requestException() {
    const parsed = RequestOfferingActivationExceptionInputSchema.safeParse({
      reason,
      documentationDueDate: dueDate,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the request details");
      return;
    }
    await run(() => offeringActivationExceptionsApi.request(offeringId, parsed.data));
    setReason("");
    setDueDate("");
  }

  async function review(decision: "Approve" | "Reject") {
    const parsed = ReviewOfferingActivationExceptionInputSchema.safeParse({
      decision,
      note: reviewNote,
    });
    if (!parsed.success || !snapshot?.current) return;
    await run(
      () =>
        offeringActivationExceptionsApi.review(
          offeringId,
          snapshot.current!.id,
          parsed.data,
        ),
      decision === "Approve",
    );
  }

  async function revoke() {
    if (!snapshot?.current) return;
    const parsed = RevokeOfferingActivationExceptionInputSchema.safeParse({ reason: revokeReason });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Add a revocation reason");
      return;
    }
    await run(
      () =>
        offeringActivationExceptionsApi.revoke(
          offeringId,
          snapshot.current!.id,
          parsed.data,
        ),
      true,
    );
  }

  async function resolve() {
    if (!snapshot?.current) return;
    await run(
      () =>
        offeringActivationExceptionsApi.resolve(offeringId, snapshot.current!.id, {
          note: reviewNote,
        }),
      true,
    );
  }

  const current = snapshot?.current ?? null;
  const latest = snapshot?.latest ?? null;
  const visible = current ?? latest;
  const approved = current?.status === "APPROVED";
  const pending = current?.status === "PENDING";

  return (
    <aside className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-amber-500/30 bg-background/95 shadow-xl backdrop-blur md:bottom-6 md:right-6">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {approved ? (
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
          ) : snapshot?.readiness.normalReady ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          )}
          <span className="truncate text-sm font-semibold">
            {visible ? statusLabel(visible.status) : "Documentation pending"}
          </span>
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {open ? (
        <div className="max-h-[72vh] space-y-3 overflow-y-auto border-t border-border px-4 py-3 text-sm">
          {loading ? <p className="text-muted-foreground">Checking academic readiness…</p> : null}
          {error ? (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
              {error}
            </div>
          ) : null}

          {snapshot ? (
            <>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="font-medium">
                  {snapshot.readiness.normalReady
                    ? "Normal academic readiness is complete."
                    : "Teaching documentation is not yet complete."}
                </p>
                {snapshot.readiness.missingItems.length ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Missing: {snapshot.readiness.missingItems.map(missingLabel).join(" · ")}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Published teaching period: {snapshot.readiness.teachingStart} – {snapshot.readiness.teachingEnd}
                </p>
              </div>

              {visible ? (
                <div className="space-y-1 rounded-lg border border-border p-3">
                  <p className="font-semibold">{statusLabel(visible.status)}</p>
                  <p className="text-xs text-muted-foreground">Reason: {visible.reason}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" /> Documentation due {visible.documentationDueDate}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requested by {visible.requestedBy.name}
                    {visible.reviewedBy ? ` · Reviewed by ${visible.reviewedBy.name}` : ""}
                  </p>
                </div>
              ) : null}

              {snapshot.readiness.canRequest && !current ? (
                <div className="space-y-2">
                  <p className="font-semibold">Request activation exception</p>
                  <p className="text-xs text-muted-foreground">
                    This authorizes teaching to begin only. It does not approve the curriculum or CourseSpec.
                  </p>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Why must teaching begin before documentation is complete?"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={2000}
                  />
                  <label className="block space-y-1 text-xs font-medium">
                    <span>Documentation due date</span>
                    <Input
                      type="date"
                      min={minimumDueDate}
                      max={snapshot.readiness.teachingEnd}
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                    />
                  </label>
                  <Button type="button" size="sm" disabled={busy} onClick={() => void requestException()}>
                    {busy ? "Saving…" : "Request exception"}
                  </Button>
                </div>
              ) : null}

              {pending && reviewer ? (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="font-semibold">Programme review</p>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Reviewer note (optional)"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                    maxLength={2000}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" disabled={busy} onClick={() => void review("Approve")}>
                      Approve & activate
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void review("Reject")}>
                      Reject
                    </Button>
                  </div>
                </div>
              ) : null}

              {approved && reviewer && snapshot.readiness.normalReady ? (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    Canonical curriculum and Approved CourseSpec are ready. Resolve the exception before completing the Offering.
                  </p>
                  <Button type="button" size="sm" disabled={busy} onClick={() => void resolve()}>
                    Resolve exception
                  </Button>
                </div>
              ) : null}

              {approved && reviewer && !snapshot.readiness.normalReady ? (
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="font-semibold">Revoke exception</p>
                  <Input
                    placeholder="Revocation reason"
                    value={revokeReason}
                    onChange={(event) => setRevokeReason(event.target.value)}
                    maxLength={2000}
                  />
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void revoke()}>
                    Revoke & return to Planned
                  </Button>
                </div>
              ) : null}

              {snapshot.history.length ? (
                <details className="border-t border-border pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    Audit history ({snapshot.history.length})
                  </summary>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {snapshot.history.map((event) => (
                      <p key={event.id}>
                        {event.action} · {new Date(event.createdAt).toLocaleString()}
                        {event.actor ? ` · ${event.actor.name}` : " · System"}
                      </p>
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
