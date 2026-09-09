"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ReviseTeachingLeaveRequest,
  TeachingLeaveHandling,
  TeachingLeaveRequestView,
  TeachingLeaveType,
} from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { teachingLeaveApi } from "@/lib/teaching-leave";

type RevisionDraft = {
  leaveType: TeachingLeaveType;
  confidentialReason: string;
  attachmentRef: string;
  proposedHandling: TeachingLeaveHandling;
  proposedNote: string;
};

function statusLabel(status: TeachingLeaveRequestView["status"]): string {
  return status.replaceAll("_", " ").toLowerCase();
}

export function TeachingLeaveRequestsClient() {
  const [requests, setRequests] = useState<TeachingLeaveRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [draft, setDraft] = useState<RevisionDraft>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await teachingLeaveApi.mine());
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your teaching leave requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function startRevision(request: TeachingLeaveRequestView) {
    setEditingId(request.id);
    setDraft({
      leaveType: request.leaveType,
      confidentialReason: request.confidentialReason,
      attachmentRef: request.attachmentRef ?? "",
      proposedHandling: request.proposedHandling,
      proposedNote: request.proposedNote,
    });
    setError(undefined);
    setMessage(undefined);
  }

  async function resubmit(request: TeachingLeaveRequestView, event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusyId(request.id);
    setError(undefined);
    setMessage(undefined);
    const input: ReviseTeachingLeaveRequest = {
      leaveType: draft.leaveType,
      confidentialReason: draft.confidentialReason.trim(),
      ...(draft.attachmentRef.trim() ? { attachmentRef: draft.attachmentRef.trim() } : {}),
      proposedHandling: draft.proposedHandling,
      ...(draft.proposedNote.trim() ? { proposedNote: draft.proposedNote.trim() } : {}),
    };
    try {
      await teachingLeaveApi.resubmit(request.id, input);
      setEditingId(undefined);
      setDraft(undefined);
      setMessage("Teaching leave request revised and resubmitted for programme review.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resubmit teaching leave request");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Your requests</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Confidential reasons and private references are visible only to you and authorized programme reviewers. If changes are requested, you can revise the private details and handling plan; the exact teaching session scope remains fixed.
        </p>
      </section>

      {message ? <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
      {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <div className="flex justify-end">
        <button type="button" onClick={() => void load()} className="rounded-md border border-input px-3 py-2 text-sm">Refresh</button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading teaching leave requests…</p>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No teaching leave requests yet.</div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <article key={request.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {request.occurrences[0]?.course.code ?? "Teaching leave"}
                    {request.occurrences.length > 1 ? ` · ${request.occurrences.length} sessions` : ""}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {request.leaveType.replaceAll("_", " ")} · {statusLabel(request.status)}{request.submittedLate ? " · Late/current-session request" : ""}
                  </p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">{request.status}</span>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Exact session scope</p>
                  <div className="mt-2 space-y-2">
                    {request.occurrences.map((occurrence) => (
                      <div key={occurrence.occurrenceId} className="text-sm">
                        <strong>{occurrence.course.code} · Class {occurrence.sectionCode}</strong><br />
                        <span className="text-muted-foreground">
                          {occurrence.sessionDate} · {occurrence.scheduledStartTime}–{occurrence.scheduledEndTime}
                          {occurrence.scheduledRoom ? ` · ${occurrence.scheduledRoom}` : ""}
                        </span>
                        {occurrence.releaseForReuse ? <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">Reusable if approved</span> : null}
                      </div>
                    ))}
                  </div>
                  {request.status === "CHANGES_REQUESTED" ? (
                    <p className="mt-3 text-xs text-muted-foreground">Session date/time and reuse selection are locked on resubmission. Submit a new request only if the affected session itself must change.</p>
                  ) : null}
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Private request details</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Reason:</strong> {request.confidentialReason}</p>
                  {request.attachmentRef ? <p className="mt-2 break-all text-sm"><strong>Private reference:</strong> {request.attachmentRef}</p> : null}
                  <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Handling:</strong> {request.proposedHandling.replaceAll("_", " ")}{request.proposedNote ? ` — ${request.proposedNote}` : ""}</p>
                </div>
              </div>

              {request.status === "CHANGES_REQUESTED" ? (
                <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <strong>Reviewer guidance:</strong> {request.reviewComment || "Please update this request before resubmitting."}
                </div>
              ) : request.reviewComment ? (
                <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 text-sm">
                  <strong>Reviewer comment:</strong> {request.reviewComment}
                </div>
              ) : null}

              {request.status === "CHANGES_REQUESTED" && editingId !== request.id ? (
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => startRevision(request)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Revise &amp; resubmit</button>
                </div>
              ) : null}

              {request.status === "CHANGES_REQUESTED" && editingId === request.id && draft ? (
                <form onSubmit={(event) => void resubmit(request, event)} className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="grid gap-1 text-sm">Leave category
                      <select value={draft.leaveType} onChange={(event) => setDraft({ ...draft, leaveType: event.target.value as TeachingLeaveType })} className="h-10 rounded-md border border-input bg-background px-3">
                        <option value="SICK">Sick</option><option value="PERSONAL">Personal</option><option value="OFFICIAL_DUTY">Official duty</option><option value="EMERGENCY">Emergency</option><option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">Proposed handling
                      <select value={draft.proposedHandling} onChange={(event) => setDraft({ ...draft, proposedHandling: event.target.value as TeachingLeaveHandling })} className="h-10 rounded-md border border-input bg-background px-3">
                        <option value="MAKE_UP">Make-up later</option><option value="RESCHEDULE">Reschedule</option><option value="CANCEL">Cancel session</option><option value="OPEN_SLOT">Release period as open slot</option><option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">Confidential reason
                      <textarea required maxLength={2000} value={draft.confidentialReason} onChange={(event) => setDraft({ ...draft, confidentialReason: event.target.value })} className="min-h-24 rounded-md border border-input bg-background p-3" />
                    </label>
                    <label className="grid gap-1 text-sm">Private attachment/reference (optional)
                      <input maxLength={500} value={draft.attachmentRef} onChange={(event) => setDraft({ ...draft, attachmentRef: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3" />
                    </label>
                    <label className="grid gap-1 text-sm">Updated handling note (optional)
                      <input maxLength={1000} value={draft.proposedNote} onChange={(event) => setDraft({ ...draft, proposedNote: event.target.value })} className="h-10 rounded-md border border-input bg-background px-3" />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" disabled={busyId === request.id} onClick={() => { setEditingId(undefined); setDraft(undefined); }} className="rounded-md border border-input px-3 py-2 text-sm">Cancel</button>
                    <button disabled={busyId === request.id} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busyId === request.id ? "Resubmitting…" : "Resubmit for review"}</button>
                  </div>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
