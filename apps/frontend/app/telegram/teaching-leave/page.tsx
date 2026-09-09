"use client";

import type { TeachingLeaveRequestView } from "@dse-pms/shared-types";
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
  return "Cancel session";
}

export default function TelegramTeachingLeavePage() {
  const [request, setRequest] = useState<TeachingLeaveRequestView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const requestId = new URLSearchParams(window.location.search).get("requestId");
    if (!requestId) {
      setError("Teaching leave request is missing from this link.");
      return;
    }
    void telegramApi<TeachingLeaveRequestView>(
      `/api/telegram/mini/teaching-leave/${encodeURIComponent(requestId)}`,
    )
      .then(setRequest)
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load teaching leave request"));
  }, []);

  return (
    <section className="space-y-5 pb-6">
      <Link href="/telegram" className="text-sm font-medium text-slate-500">← Home</Link>
      <header>
        <p className="text-sm font-medium text-blue-600">DSE PMS</p>
        <h1 className="text-2xl font-semibold tracking-tight">Teaching leave request</h1>
        <p className="mt-1 text-sm text-slate-500">Private status and reviewer guidance for your request.</p>
      </header>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {!request && !error ? <p className="text-sm text-slate-500">Loading request…</p> : null}

      {request ? (
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Status</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{statusLabel(request.status)}</p>
              </div>
              {request.submittedLate ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">Late notice</span>
              ) : null}
            </div>
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
              <p className="mt-1 text-sm text-slate-500">{occurrence.scheduledRoom ? `Room ${occurrence.scheduledRoom}` : "Room not set"}</p>
              <p className="mt-3 text-sm text-slate-700">{handlingLabel(request.proposedHandling)}</p>
            </section>
          ))}

          {request.reviewComment ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Reviewer guidance</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-amber-950">{request.reviewComment}</p>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your private request</p>
            <p className="mt-2 text-sm text-slate-700">Reason: {request.confidentialReason}</p>
            {request.proposedNote ? <p className="mt-2 text-sm text-slate-700">Plan: {request.proposedNote}</p> : null}
            <p className="mt-3 text-xs text-slate-500">These private details are not included in student or lecturer-group notifications.</p>
          </section>

          {request.status === "CHANGES_REQUESTED" ? (
            <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
              Update and resubmit this request from Teaching Schedule → My leave requests in the full PMS.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
