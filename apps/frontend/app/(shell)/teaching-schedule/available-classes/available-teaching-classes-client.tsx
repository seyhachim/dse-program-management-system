"use client";

import type {
  UnassignedTeachingMeetingView,
  UnassignedTeachingRequestView,
} from "@dse-pms/shared-types";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import { unassignedTeachingApi } from "@/lib/unassigned-teaching";
import { Topbar } from "../../topbar";

function statusLabel(status: UnassignedTeachingRequestView["status"]): string {
  if (status === "SUPERSEDED") return "Another lecturer assigned";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function AvailableTeachingClassesClient() {
  const [meetings, setMeetings] = useState<UnassignedTeachingMeetingView[]>([]);
  const [requests, setRequests] = useState<UnassignedTeachingRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [available, mine] = await Promise.all([
        unassignedTeachingApi.available(),
        unassignedTeachingApi.mine(),
      ]);
      setMeetings(available);
      setRequests(mine);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load available teaching classes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const requestByMeeting = useMemo(
    () => new Map(
      requests
        .filter((request) => request.status === "PENDING" || request.status === "APPROVED")
        .map((request) => [request.meeting.meetingId, request]),
    ),
    [requests],
  );

  async function requestMeeting(meetingId: string) {
    setBusy(meetingId);
    setError("");
    setMessage("");
    try {
      await unassignedTeachingApi.submit(meetingId);
      setMessage("Teaching assignment request sent for programme review.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not request this class");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <>
      <Topbar
        title="Available Classes"
        subtitle="Request responsibility for a recurring weekly class that currently has no assigned lecturer."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/teaching-schedule" className="text-sm font-medium text-muted-foreground hover:text-foreground">← Teaching schedule</Link>
            <span className="text-sm text-muted-foreground">{meetings.length} available</span>
          </div>

          <section className="rounded-xl border bg-card p-4 text-sm leading-6 text-muted-foreground">
            These are recurring timetable meetings with no lecturer assigned. Approval assigns only this weekly meeting to you and adds you to the Offering teaching team when needed. This is not teaching-leave substitution.
          </section>

          {message ? <p className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}
          {error ? <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

          {loading ? (
            <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Loading available classes…</p>
          ) : meetings.length === 0 ? (
            <section className="rounded-xl border border-dashed bg-card p-8 text-center">
              <h2 className="font-semibold">No unassigned weekly classes</h2>
              <p className="mt-1 text-sm text-muted-foreground">There is nothing available in your lecturer programme right now.</p>
            </section>
          ) : (
            <section className="space-y-3">
              {meetings.map((meeting) => {
                const existing = requestByMeeting.get(meeting.meetingId);
                return (
                  <article key={meeting.meetingId} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                          {meeting.dayOfWeek} · {meeting.startTime}–{meeting.endTime}
                        </p>
                        <h2 className="mt-1 font-semibold">
                          {meeting.course.code} — {meeting.course.title}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Class {meeting.sectionCode} · {meeting.term} · {meeting.activityType}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {meeting.building ? `${meeting.building} · ` : ""}{meeting.room ? `Room ${meeting.room}` : "Room not set"}
                        </p>
                      </div>
                      {existing ? (
                        <span className="rounded-full border px-3 py-1.5 text-xs font-semibold">
                          {statusLabel(existing.status)}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy === meeting.meetingId}
                          onClick={() => void requestMeeting(meeting.meetingId)}
                          className="min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          {busy === meeting.meetingId ? "Submitting…" : "Request to teach"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">My requests</h2>
            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have not requested an unassigned class yet.</p>
            ) : requests.map((request) => (
              <article key={request.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{request.meeting.course.code} · Class {request.meeting.sectionCode}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {request.meeting.dayOfWeek} · {request.meeting.startTime}–{request.meeting.endTime}
                    </p>
                    {request.reviewComment ? <p className="mt-2 text-sm">Reviewer note: {request.reviewComment}</p> : null}
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{statusLabel(request.status)}</span>
                </div>
              </article>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}
