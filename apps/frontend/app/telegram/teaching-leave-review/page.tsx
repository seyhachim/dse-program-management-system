"use client";

import type {
  TeachingLeaveRequestView,
  TeachingLeaveReviewDecision,
  TeachingLeaveReviewResult,
} from "@dse-pms/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { telegramApi } from "../telegram-client";

function statusLabel(status: TeachingLeaveRequestView["status"]): string {
  if (status === "CHANGES_REQUESTED") return "Changes requested";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function handlingLabel(value: TeachingLeaveRequestView["proposedHandling"]): string {
  if (value === "OPEN_SLOT") return "Release as open teaching slot";
  if (value === "MAKE_UP") return "Make up later";
  if (value === "RESCHEDULE") return "Reschedule";
  if (value === "OTHER") return "Other arrangement";
  return "Cancel session";
}

export default function TelegramTeachingLeaveReviewPage() {
  const [request, setRequest] = useState<TeachingLeaveRequestView | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<TeachingLeaveReviewDecision>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const requestId = new URLSearchParams(window.location.search).get("requestId");
    if (!requestId) {
      setError("Teaching leave request is missing from this link.");
      return;
    }

    void telegramApi<TeachingLeaveRequestView>(
      `/api/telegram/mini/teaching-leave/${encodeURIComponent(requestId)}/review`,
    )
      .then(setRequest)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load teaching leave request"));
  }, []);

  async function decide(decision: TeachingLeaveReviewDecision) {
    if (!request) return;
    const reviewerComment = comment.trim();
    if (decision === "REQUEST_CHANGES" && !reviewerComment) {
      setError("Add reviewer guidance before requesting changes.");
      return;
    }

    setBusy(decision);
    setError("");
    setMessage("");
    try {
      const result = await telegramApi<TeachingLeaveReviewResult>(
        `/api/telegram/mini/teaching-leave/${encodeURIComponent(request.id)}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            ...(reviewerComment ? { comment: reviewerComment } : {}),
          }),
        },
      );
      setRequest(result.request);
      setComment("");
      setMessage(`Request ${statusLabel(result.request.status).toLowerCase()}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not review teaching leave request");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="space-y-5 pb-6">
      <Link href="/telegram" className="text-sm font-medium text-slate-500">← Home</Link>
      <header>
        <p className="text-sm font-medium text-blue-600">DSE PMS · Programme review</p>
        <h1 className="text-2xl font-semibold tracking-tight">Teaching leave review</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review confidential details securely in PMS before recording a decision.
        </p>
      </header>

      {message ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!request && !error ? <p className="text-sm text-slate-500">Loading request…</p> : null}

      {request ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Requester</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{request.requester.name}</p>
                <p className="mt-1 text-sm text-slate-600">{request.leaveType.replaceAll("_", " ")}</p>
              </div>
              <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium">
                {statusLabel(request.status)}
              </span>
            </div>
            {request.submittedLate ? (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                Late/current-session request
              </p>
            ) : null}
          </section>

          {request.occurrences.map((occurrence) => (
            <section key={occurrence.occurrenceId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                {occurrence.course.code} · Class {occurrence.sectionCode}
              </p>
              <h2 className="mt-1 font-semibold text-slate-950">{occurrence.course.title}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {occurrence.sessionDate} · {occurrence.scheduledStartTime}–{occurrence.scheduledEndTime}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {occurrence.scheduledRoom ? `Room ${occurrence.scheduledRoom}` : "Room not set"}
              </p>
              {occurrence.releaseForReuse ? (
                <p className="mt-2 text-xs font-medium text-blue-700">Requested as reusable teaching slot</p>
              ) : null}
            </section>
          ))}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confidential review information</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
              <strong>Reason:</strong> {request.confidentialReason}
            </p>
            {request.attachmentRef ? (
              <p className="mt-2 break-all text-sm text-slate-800">
                <strong>Private reference:</strong> {request.attachmentRef}
              </p>
            ) : null}
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
              <strong>Proposed handling:</strong> {handlingLabel(request.proposedHandling)}
              {request.proposedNote ? ` — ${request.proposedNote}` : ""}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              These details stay inside the authorized PMS review workflow and are not copied into the Telegram alert.
            </p>
          </section>

          {request.status === "PENDING" ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="grid gap-1 text-sm font-medium text-slate-800">
                Reviewer comment
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={1500}
                  className="min-h-24 rounded-xl border border-slate-300 bg-white p-3 font-normal"
                  placeholder="Required when requesting changes; optional for approve/reject."
                />
              </label>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy) || !comment.trim()}
                  onClick={() => void decide("REQUEST_CHANGES")}
                  className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "REQUEST_CHANGES" ? "Saving…" : "Request changes"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void decide("REJECT")}
                  className="rounded-xl border border-red-300 px-4 py-3 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  {busy === "REJECT" ? "Saving…" : "Reject"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void decide("APPROVE")}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "APPROVE" ? "Saving…" : "Approve"}
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
              This request is already {statusLabel(request.status).toLowerCase()}.
              {request.reviewedBy ? ` Reviewed by ${request.reviewedBy.name}.` : ""}
              {request.reviewComment ? (
                <p className="mt-2 whitespace-pre-wrap"><strong>Reviewer comment:</strong> {request.reviewComment}</p>
              ) : null}
            </section>
          )}
        </div>
      ) : null}
    </section>
  );
}
