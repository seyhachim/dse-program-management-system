"use client";

import type {
  UnassignedTeachingRequestView,
  UnassignedTeachingReviewResult,
} from "@dse-pms/shared-types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { telegramApi } from "../telegram-client";

function statusLabel(status: UnassignedTeachingRequestView["status"]): string {
  if (status === "SUPERSEDED") return "Another lecturer assigned";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default function TelegramTeachingAssignmentReviewPage() {
  const [request, setRequest] = useState<UnassignedTeachingRequestView | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<"APPROVE" | "REJECT">();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const requestId = new URLSearchParams(window.location.search).get("requestId");
    if (!requestId) {
      setError("Teaching assignment request is missing from this link.");
      return;
    }
    void telegramApi<UnassignedTeachingRequestView>(
      `/api/telegram/mini/unassigned-teaching/requests/${encodeURIComponent(requestId)}/review`,
    )
      .then(setRequest)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load teaching assignment request"));
  }, []);

  async function review(decision: "APPROVE" | "REJECT") {
    if (!request) return;
    setBusy(decision);
    setError("");
    setMessage("");
    try {
      const result = await telegramApi<UnassignedTeachingReviewResult>(
        `/api/telegram/mini/unassigned-teaching/requests/${encodeURIComponent(request.id)}/review`,
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            ...(comment.trim() ? { comment: comment.trim() } : {}),
          }),
        },
      );
      setRequest(result.request);
      setComment("");
      setMessage(
        result.changed
          ? `Request ${statusLabel(result.request.status).toLowerCase()}.`
          : "This request was already reviewed.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not review teaching assignment request");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="space-y-5 pb-6">
      <Link href="/telegram" className="text-sm font-medium text-slate-500">← Home</Link>
      <header>
        <p className="text-sm font-medium text-blue-600">DSE PMS · Programme review</p>
        <h1 className="text-2xl font-semibold tracking-tight">Teaching assignment request</h1>
        <p className="mt-1 text-sm text-slate-500">
          Confirm whether this lecturer should take responsibility for the recurring unassigned class.
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
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Requested by</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{request.requester.name}</p>
              </div>
              <span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium">
                {statusLabel(request.status)}
              </span>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              {request.meeting.course.code} · Class {request.meeting.sectionCode}
            </p>
            <h2 className="mt-1 font-semibold text-slate-950">{request.meeting.course.title}</h2>
            <p className="mt-3 text-sm text-slate-700">
              {request.meeting.dayOfWeek} · {request.meeting.startTime}–{request.meeting.endTime}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {request.meeting.building ? `${request.meeting.building} · ` : ""}
              {request.meeting.room ? `Room ${request.meeting.room}` : "Room not set"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {request.meeting.term} · {request.meeting.activityType}
            </p>
          </section>

          <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            Approval adds the lecturer to the Offering teaching team when needed and assigns this exact recurring weekly meeting. It does not create teaching-leave evidence or rewrite historical class records.
          </section>

          {request.status === "PENDING" ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="grid gap-1 text-sm font-medium text-slate-800">
                Reviewer note <span className="font-normal text-slate-500">(optional)</span>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={1500}
                  className="min-h-24 rounded-xl border border-slate-300 bg-white p-3 font-normal"
                  placeholder="Optional operational note for the lecturer"
                />
              </label>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void review("REJECT")}
                  className="rounded-xl border border-red-300 px-4 py-3 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  {busy === "REJECT" ? "Saving…" : "Reject"}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void review("APPROVE")}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "APPROVE" ? "Saving…" : "Approve & assign class"}
                </button>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
              This request is {statusLabel(request.status).toLowerCase()}.
              {request.reviewedBy ? ` Reviewed by ${request.reviewedBy.name}.` : ""}
              {request.reviewComment ? (
                <p className="mt-2 whitespace-pre-wrap"><strong>Reviewer note:</strong> {request.reviewComment}</p>
              ) : null}
            </section>
          )}
        </div>
      ) : null}
    </section>
  );
}
