"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Save, UserCheck, UserMinus, UsersRound } from "lucide-react";
import type {
  AttendanceRecordView,
  AttendanceSessionSummary,
  AttendanceSessionView,
  AttendanceStatus,
  OfferingView,
} from "@dse-pms/shared-types";
import { ATTENDANCE_STATUSES } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { offeringsApi } from "@/lib/offerings";
import { Topbar } from "../topbar";

function localDateValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function offeringLabel(offering: OfferingView): string {
  return offering.course
    ? `${offering.course.code} · ${offering.sectionCode} · ${offering.term}`
    : `${offering.sectionCode} · ${offering.term}`;
}

function statusClass(status: AttendanceStatus | null): string {
  if (status === "Present") return "border-status-live/30 bg-status-live-bg text-status-live";
  if (status === "Absent") return "border-destructive/30 bg-destructive/5 text-destructive";
  if (status === "Late") return "border-status-upcoming/30 bg-status-upcoming-bg text-status-upcoming";
  if (status === "Excused") return "border-border bg-muted/40 text-muted-foreground";
  return "border-border bg-background text-muted-foreground";
}

export function AttendanceClient() {
  const [offerings, setOfferings] = useState<OfferingView[]>([]);
  const [offeringId, setOfferingId] = useState("");
  const [date, setDate] = useState(localDateValue());
  const [session, setSession] = useState<AttendanceSessionView | null>(null);
  const [history, setHistory] = useState<AttendanceSessionSummary[]>([]);
  const [records, setRecords] = useState<AttendanceRecordView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    offeringsApi
      .list()
      .then((rows) => {
        if (cancelled) return;
        setOfferings(rows);
        const firstActive = rows.find((row) => row.status === "Active") ?? rows[0];
        setOfferingId(firstActive?.id ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load teaching classes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!offeringId || !date) {
      setSession(null);
      setRecords([]);
      setHistory([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedMessage(null);
    Promise.all([offeringsApi.attendance(offeringId, date), offeringsApi.attendanceSessions(offeringId)])
      .then(([attendance, sessions]) => {
        if (cancelled) return;
        setSession(attendance);
        setRecords(attendance.records);
        setHistory(sessions);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load attendance");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [offeringId, date]);

  const selectedOffering = offerings.find((offering) => offering.id === offeringId) ?? null;

  const counts = useMemo(() => {
    const next = { Present: 0, Absent: 0, Late: 0, Excused: 0, Unmarked: 0 };
    for (const record of records) {
      if (record.status) next[record.status] += 1;
      else next.Unmarked += 1;
    }
    return next;
  }, [records]);

  function updateRecord(studentId: string, patch: Partial<Pick<AttendanceRecordView, "status" | "note">>) {
    setSavedMessage(null);
    setRecords((current) =>
      current.map((record) => (record.studentId === studentId ? { ...record, ...patch } : record)),
    );
  }

  function markAll(status: AttendanceStatus | null) {
    setSavedMessage(null);
    setRecords((current) => current.map((record) => ({ ...record, status })));
  }

  async function save() {
    if (!offeringId) return;
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const saved = await offeringsApi.saveAttendance(offeringId, date, {
        records: records
          .filter((record) => record.status !== null)
          .map((record) => ({
            studentId: record.studentId,
            status: record.status!,
            note: record.note.trim(),
          })),
      });
      setSession(saved);
      setRecords(saved.records);
      setHistory(await offeringsApi.attendanceSessions(offeringId));
      setSavedMessage(`Attendance saved for ${date}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar
        title="Attendance"
        subtitle="Record section attendance by teaching date and keep a reusable attendance history."
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Class section</label>
              <select
                value={offeringId}
                onChange={(event) => setOfferingId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {offerings.length === 0 ? <option value="">No assigned classes</option> : null}
                {offerings.map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {offeringLabel(offering)}
                  </option>
                ))}
              </select>
              {selectedOffering?.course ? (
                <p className="text-sm text-muted-foreground">
                  {selectedOffering.course.title} · {selectedOffering.enrolledCount} enrolled
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attendance date</label>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">One register per class section and calendar date.</p>
            </div>
          </section>

          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {savedMessage ? (
            <div className="rounded-xl border border-status-live/30 bg-status-live-bg px-4 py-3 text-sm text-status-live">
              {savedMessage}
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <SummaryCard icon={<UserCheck className="h-4 w-4" />} label="Present" value={counts.Present} />
            <SummaryCard icon={<UserMinus className="h-4 w-4" />} label="Absent" value={counts.Absent} />
            <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="Late" value={counts.Late} />
            <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Excused" value={counts.Excused} />
            <SummaryCard icon={<UsersRound className="h-4 w-4" />} label="Unmarked" value={counts.Unmarked} />
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Attendance register</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mark everyone present first, then change only absences, late arrivals, or excused students.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => markAll("Present")}
                  disabled={records.length === 0 || saving}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Mark all present
                </button>
                <button
                  type="button"
                  onClick={() => markAll(null)}
                  disabled={records.length === 0 || saving}
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Clear marks
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!offeringId || loading || saving || records.length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving…" : "Save attendance"}
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Loading attendance…</div>
            ) : records.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                This class has no enrolled students yet. Add students to the offering before recording attendance.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Student ID</th>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.map((record) => (
                      <tr key={record.studentId} className="align-middle hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{record.studentNumber}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{record.studentName}</td>
                        <td className="px-4 py-3">
                          <select
                            value={record.status ?? ""}
                            onChange={(event) =>
                              updateRecord(record.studentId, {
                                status: (event.target.value || null) as AttendanceStatus | null,
                              })
                            }
                            className={`h-9 min-w-[130px] rounded-md border px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring ${statusClass(record.status)}`}
                          >
                            <option value="">Unmarked</option>
                            {ATTENDANCE_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={record.note}
                            maxLength={300}
                            placeholder="Optional note"
                            onChange={(event) => updateRecord(record.studentId, { note: event.target.value })}
                            className="h-9 w-full min-w-[240px] rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-4">
              <h2 className="font-semibold text-foreground">Attendance history</h2>
              <p className="mt-1 text-sm text-muted-foreground">Open any saved date to review or correct the register.</p>
            </div>
            {history.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No attendance sessions have been saved for this class yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Present</th>
                      <th className="px-4 py-3">Absent</th>
                      <th className="px-4 py-3">Late</th>
                      <th className="px-4 py-3">Excused</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((item) => (
                      <tr key={item.sessionId} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium text-foreground">{item.date}</td>
                        <td className="px-4 py-3 tabular-nums">{item.counts.Present}</td>
                        <td className="px-4 py-3 tabular-nums">{item.counts.Absent}</td>
                        <td className="px-4 py-3 tabular-nums">{item.counts.Late}</td>
                        <td className="px-4 py-3 tabular-nums">{item.counts.Excused}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setDate(item.date)}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            Open register
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {session?.updatedAt ? (
            <p className="text-right text-xs text-muted-foreground">
              Last saved {new Date(session.updatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </main>
    </>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}
