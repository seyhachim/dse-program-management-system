"use client";

import { useCallback, useEffect, useState } from "react";
import type { TeachingLeaveRequestView, TeachingLeaveReviewDecision } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { teachingLeaveApi } from "@/lib/teaching-leave";

function statusLabel(status: TeachingLeaveRequestView["status"]) {
  return status.replaceAll("_", " ").toLowerCase();
}

export function TeachingLeaveReviewClient() {
  const [requests, setRequests] = useState<TeachingLeaveRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string>();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await teachingLeaveApi.reviewQueue());
      setError(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load teaching leave review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(request: TeachingLeaveRequestView, decision: TeachingLeaveReviewDecision) {
    setBusyId(request.id);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await teachingLeaveApi.review(request.id, {
        decision,
        ...(comments[request.id]?.trim() ? { comment: comments[request.id]!.trim() } : {}),
      });
      const groupSummary = result.notifications.lecturerGroup.length > 0
        ? ` Lecturer-group delivery: ${result.notifications.lecturerGroup.map((item) => item.status).join(", ")}.`
        : "";
      setMessage(`Request ${statusLabel(result.request.status)}.${groupSummary}`);
      setComments((current) => ({ ...current, [request.id]: "" }));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not review teaching leave request");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">Programme review queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only programme administrators/coordinators can review. Confidential reasons, private references, and reviewer comments stay inside this protected PMS workflow. Students and lecturer-group notifications receive schedule impact only.
        </p>
      </section>

      {message ? <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div> : null}
      {error ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <div className="flex justify-end"><button onClick={() => void load()} className="rounded-md border border-input px-3 py-2 text-sm">Refresh</button></div>

      {loading ? <p className="text-sm text-muted-foreground">Loading review queue…</p> : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No pending teaching leave requests.</div>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const hasGuidance = Boolean(comments[request.id]?.trim());
            return (
              <article key={request.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{request.requester.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{request.leaveType.replaceAll("_", " ")} · {statusLabel(request.status)}{request.submittedLate ? " · Late/current-session request" : ""}</p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">{request.status}</span>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Confidential review information</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Reason:</strong> {request.confidentialReason}</p>
                    {request.attachmentRef ? <p className="mt-2 break-all text-sm"><strong>Private reference:</strong> {request.attachmentRef}</p> : null}
                    <p className="mt-2 whitespace-pre-wrap text-sm"><strong>Proposed handling:</strong> {request.proposedHandling.replaceAll("_", " ")}{request.proposedNote ? ` — ${request.proposedNote}` : ""}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Submitted {new Date(request.submittedAt).toLocaleString()} · notice threshold {request.noticeHours} h</p>
                  </div>

                  <div className="rounded-lg border border-border p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Affected exact sessions</p>
                    <div className="mt-2 space-y-2">
                      {request.occurrences.map((occurrence) => (
                        <div key={occurrence.occurrenceId} className="text-sm">
                          <strong>{occurrence.course.code} · Class {occurrence.sectionCode}</strong><br />
                          <span className="text-muted-foreground">{occurrence.sessionDate} · {occurrence.scheduledStartTime}–{occurrence.scheduledEndTime}{occurrence.scheduledRoom ? ` · ${occurrence.scheduledRoom}` : ""}</span>
                          {occurrence.releaseForReuse ? <span className="ml-2 rounded-full border px-2 py-0.5 text-xs">Reusable slot</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <label className="mt-4 grid gap-1 text-sm">Reviewer comment
                  <textarea value={comments[request.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))} maxLength={1500} className="min-h-20 rounded-md border border-input bg-background p-3" placeholder="Internal guidance for the requester; not sent to students or the lecturer group." />
                </label>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    disabled={busyId === request.id || !hasGuidance}
                    title={hasGuidance ? undefined : "Add reviewer guidance before requesting changes"}
                    onClick={() => void decide(request, "REQUEST_CHANGES")}
                    className="rounded-md border border-input px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Request changes
                  </button>
                  <button disabled={busyId === request.id} onClick={() => void decide(request, "REJECT")} className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive disabled:opacity-50">Reject</button>
                  <button disabled={busyId === request.id} onClick={() => void decide(request, "APPROVE")} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busyId === request.id ? "Saving…" : "Approve"}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
