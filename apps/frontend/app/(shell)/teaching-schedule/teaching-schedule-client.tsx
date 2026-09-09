"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, UsersRound } from "lucide-react";
import {
  MEETING_DAYS,
  type LecturerScheduleRow,
  type LecturerWorkloadSummary,
  type TeachingLeaveHandling,
  type TeachingLeaveType,
} from "@dse-pms/shared-types";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { offeringsApi, workloadForTerm } from "@/lib/offerings";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { teachingLeaveApi } from "@/lib/teaching-leave";
import { Topbar } from "../topbar";

const ALL_TERMS = "__all__";

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function TeachingScheduleClient() {
  const { me, loading: meLoading } = useMe();
  const [term, setTerm] = useState(ALL_TERMS);
  const [leaveMeetingId, setLeaveMeetingId] = useState<string>();
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveType, setLeaveType] = useState<TeachingLeaveType>("PERSONAL");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveHandling, setLeaveHandling] = useState<TeachingLeaveHandling>("MAKE_UP");
  const [leaveNote, setLeaveNote] = useState("");
  const [attachmentRef, setAttachmentRef] = useState("");
  const [releaseForReuse, setReleaseForReuse] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState<string>();
  const [leaveError, setLeaveError] = useState<string>();
  const queryScope = { userId: me?.id ?? "pending" };
  const workloadQuery = useQuery({
    queryKey: protectedQueryKey(queryScope, "offerings", "workload"),
    queryFn: () => offeringsApi.workload(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
  });
  const summary: LecturerWorkloadSummary | null = workloadQuery.data ?? null;
  const hasData = workloadQuery.data !== undefined;
  const loading = meLoading || (!hasData && workloadQuery.isPending);
  const hardQueryError = !hasData && workloadQuery.isError;
  const error = hardQueryError
    ? workloadQuery.error instanceof ApiError
      ? workloadQuery.error.message
      : "Failed to load your teaching schedule"
    : null;

  const terms = useMemo(() => {
    if (!summary) return [];
    return [...new Set(summary.scheduleRows.map((row) => row.term))]
      .filter(Boolean)
      .sort()
      .reverse();
  }, [summary]);

  const filteredSummary = useMemo(() => {
    if (!summary) return null;
    return workloadForTerm(summary, term === ALL_TERMS ? null : term);
  }, [summary, term]);

  const rowsByDay = useMemo(() => {
    const rows = filteredSummary?.scheduleRows ?? [];
    const grouped = new Map<string, LecturerScheduleRow[]>();
    for (const day of MEETING_DAYS) grouped.set(day, []);
    for (const row of rows) grouped.get(row.dayOfWeek)?.push(row);
    for (const dayRows of grouped.values()) dayRows.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return grouped;
  }, [filteredSummary]);

  const activeDays = MEETING_DAYS.filter((day) => (rowsByDay.get(day)?.length ?? 0) > 0);

  function openLeave(row: LecturerScheduleRow) {
    setLeaveMeetingId(row.meetingId);
    setLeaveDate("");
    setLeaveType("PERSONAL");
    setLeaveReason("");
    setLeaveHandling("MAKE_UP");
    setLeaveNote("");
    setAttachmentRef("");
    setReleaseForReuse(false);
    setLeaveError(undefined);
    setLeaveMessage(undefined);
  }

  async function submitLeave(row: LecturerScheduleRow, event: React.FormEvent) {
    event.preventDefault();
    setLeaveBusy(true);
    setLeaveError(undefined);
    setLeaveMessage(undefined);
    try {
      const request = await teachingLeaveApi.submit({
        occurrences: [{
          offeringId: row.offeringId,
          offeringMeetingId: row.meetingId,
          date: leaveDate,
          releaseForReuse,
        }],
        leaveType,
        confidentialReason: leaveReason,
        ...(attachmentRef.trim() ? { attachmentRef: attachmentRef.trim() } : {}),
        proposedHandling: leaveHandling,
        ...(leaveNote.trim() ? { proposedNote: leaveNote.trim() } : {}),
      });
      setLeaveMessage(`Teaching leave request submitted${request.submittedLate ? " as a late/current-session request" : ""}. It is pending programme review.`);
      setLeaveMeetingId(undefined);
    } catch (err) {
      setLeaveError(err instanceof ApiError ? err.message : "Could not submit teaching leave request");
    } finally {
      setLeaveBusy(false);
    }
  }

  return (
    <>
      <Topbar
        title="Teaching Schedule"
        subtitle="Your recurring weekly classes across all assigned course offerings."
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Weekly timetable</p>
              <p className="text-sm text-muted-foreground">
                Includes classes where you are the primary lecturer or co-lecturer. Teaching leave is requested for an exact session date, not the recurring timetable itself.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Term</span>
              <select
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={ALL_TERMS}>All terms</option>
                {terms.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </div>

          {leaveMessage ? <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">{leaveMessage}</div> : null}
          {leaveError ? <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{leaveError}</div> : null}

          <QueryRefreshStatus
            hasData={hasData}
            isPending={workloadQuery.isPending}
            isFetching={workloadQuery.isFetching}
            isError={workloadQuery.isError}
            label="Teaching schedule"
          />

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading your teaching schedule…</div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
          ) : !filteredSummary || filteredSummary.scheduleRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
              <CalendarDays className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">No scheduled classes yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">When meeting times are added to your assigned offerings, they will appear here.</p>
            </div>
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="Scheduled weekly hours" value={`${formatHours(filteredSummary.scheduledWeeklyHours)} h`} />
                <SummaryCard icon={<CalendarDays className="h-4 w-4" />} label="Teaching days" value={String(activeDays.length)} />
                <SummaryCard icon={<UsersRound className="h-4 w-4" />} label="Weekly meetings" value={String(filteredSummary.scheduleRows.length)} />
                <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="Peak planned week" value={`${formatHours(filteredSummary.peakWeeklyHours)} h`} />
              </section>

              <section className="space-y-4">
                {activeDays.map((day) => {
                  const dayRows = rowsByDay.get(day) ?? [];
                  return (
                    <div key={day} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                      <div className="border-b border-border bg-muted/30 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <h2 className="font-semibold text-foreground">{day}</h2>
                          <span className="text-xs text-muted-foreground">{dayRows.length} {dayRows.length === 1 ? "class" : "classes"}</span>
                        </div>
                      </div>

                      <div className="divide-y divide-border">
                        {dayRows.map((row) => (
                          <div key={row.meetingId}>
                            <div className="grid gap-3 px-4 py-4 md:grid-cols-[120px_minmax(0,1fr)_180px_200px] md:items-center">
                              <div>
                                <p className="font-semibold text-foreground">{row.startTime}–{row.endTime}</p>
                                <p className="text-xs text-muted-foreground">{formatHours(row.durationHours)} h</p>
                              </div>

                              <div className="min-w-0">
                                <Link href={`/courses/${row.course.id}/spec`} className="font-medium text-foreground hover:underline">
                                  {row.course.code} — {row.course.title}
                                </Link>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  <span>Class {row.sectionCode}</span><span>{row.term}</span><span>{row.activityType}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MapPin className="h-4 w-4 shrink-0" /><span>{row.room || "Room not set"}</span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                <span className="inline-flex rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground">{row.role}</span>
                                <button type="button" onClick={() => leaveMeetingId === row.meetingId ? setLeaveMeetingId(undefined) : openLeave(row)} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent">
                                  {leaveMeetingId === row.meetingId ? "Cancel" : "Request leave"}
                                </button>
                              </div>
                            </div>

                            {leaveMeetingId === row.meetingId ? (
                              <form onSubmit={(event) => void submitLeave(row, event)} className="border-t border-border bg-muted/20 p-4">
                                <div className="mb-4">
                                  <h3 className="font-medium text-foreground">Request teaching leave — {row.course.code}</h3>
                                  <p className="mt-1 text-xs text-muted-foreground">Choose the exact {row.dayOfWeek} session. The confidential reason and private reference are visible only to authorized reviewers.</p>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                  <label className="grid gap-1 text-sm">Session date
                                    <input required type="date" value={leaveDate} onChange={(event) => setLeaveDate(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3" />
                                  </label>
                                  <label className="grid gap-1 text-sm">Leave category
                                    <select value={leaveType} onChange={(event) => setLeaveType(event.target.value as TeachingLeaveType)} className="h-10 rounded-md border border-input bg-background px-3">
                                      <option value="SICK">Sick</option><option value="PERSONAL">Personal</option><option value="OFFICIAL_DUTY">Official duty</option><option value="EMERGENCY">Emergency</option><option value="OTHER">Other</option>
                                    </select>
                                  </label>
                                  <label className="grid gap-1 text-sm">Proposed handling
                                    <select value={leaveHandling} onChange={(event) => setLeaveHandling(event.target.value as TeachingLeaveHandling)} className="h-10 rounded-md border border-input bg-background px-3">
                                      <option value="MAKE_UP">Make-up later</option><option value="RESCHEDULE">Reschedule</option><option value="CANCEL">Cancel session</option><option value="OPEN_SLOT">Release period as open slot</option><option value="OTHER">Other</option>
                                    </select>
                                  </label>
                                  <label className="grid gap-1 text-sm md:col-span-2 lg:col-span-3">Confidential reason
                                    <textarea required maxLength={2000} value={leaveReason} onChange={(event) => setLeaveReason(event.target.value)} className="min-h-24 rounded-md border border-input bg-background p-3" />
                                  </label>
                                  <label className="grid gap-1 text-sm">Private attachment/reference (optional)
                                    <input maxLength={500} value={attachmentRef} onChange={(event) => setAttachmentRef(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3" placeholder="Private storage reference or note" />
                                  </label>
                                  <label className="grid gap-1 text-sm md:col-span-2">Proposed make-up / handling note (optional)
                                    <input maxLength={1000} value={leaveNote} onChange={(event) => setLeaveNote(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3" />
                                  </label>
                                  <label className="flex items-start gap-2 text-sm md:col-span-2 lg:col-span-3">
                                    <input type="checkbox" checked={releaseForReuse} onChange={(event) => setReleaseForReuse(event.target.checked)} className="mt-1" />
                                    <span><strong>Release this period for reuse if approved.</strong><br /><span className="text-xs text-muted-foreground">This allows #933 to offer the period to another eligible lecturer for their own assigned course. Your original course still remains missed/recovery-required.</span></span>
                                  </label>
                                </div>
                                <div className="mt-4 flex justify-end">
                                  <button disabled={leaveBusy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{leaveBusy ? "Submitting…" : "Submit for review"}</button>
                                </div>
                              </form>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>

              {filteredSummary.coLecturerAssumption === "full" ? <p className="text-xs text-muted-foreground">Co-lecturer schedule entries are shown in full until workload-sharing rules are configured.</p> : null}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}
