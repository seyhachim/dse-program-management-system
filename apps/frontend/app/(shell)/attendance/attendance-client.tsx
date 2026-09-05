"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Play, Save, Search, UserCheck, UserMinus, UsersRound } from "lucide-react";
import type {
  AttendanceRecordView,
  AttendanceSessionSummary,
  AttendanceSessionView,
  AttendanceStatus,
  OfferingView,
} from "@dse-pms/shared-types";
import { ATTENDANCE_STATUSES } from "@dse-pms/shared-types";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { offeringsApi } from "@/lib/offerings";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { Topbar } from "../topbar";
import { RollCallDialog } from "./roll-call-dialog";
import {
  attendanceRecordsEqual,
  cloneAttendanceRecords,
  getAttendanceCounts,
  getTeachingWeek,
  toSaveAttendanceRecords,
  updateAttendanceRecord,
} from "./roll-call-state";

const PENDING_VALUE = "__permission_pending__";

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

function formatSessionDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short",
  }).format(parsed);
}

function statusClass(record: AttendanceRecordView): string {
  if (record.permissionPending) return "border-amber-300 bg-amber-50 text-amber-800";
  if (record.status === "Present") return "border-status-live/30 bg-status-live-bg text-status-live";
  if (record.status === "Absent") return "border-destructive/30 bg-destructive/5 text-destructive";
  if (record.status === "Late") return "border-status-upcoming/30 bg-status-upcoming-bg text-status-upcoming";
  if (record.status === "Excused") return "border-border bg-muted/40 text-muted-foreground";
  return "border-border bg-background text-muted-foreground";
}

function attendanceStatusLabel(status: AttendanceStatus): string {
  return status === "Excused" ? "Permission / Excused" : status;
}

export function AttendanceClient() {
  const { me, loading: meLoading } = useMe();
  const queryClient = useQueryClient();
  const [offeringId, setOfferingId] = useState("");
  const [date, setDate] = useState(localDateValue());
  const [records, setRecords] = useState<AttendanceRecordView[]>([]);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rollCallOpen, setRollCallOpen] = useState(false);
  const [rollCallSnapshot, setRollCallSnapshot] = useState<AttendanceRecordView[] | null>(null);
  const hydratedContextRef = useRef("");
  const baselineRecordsRef = useRef<AttendanceRecordView[]>([]);

  const queryScope = { userId: me?.id ?? "pending" };
  const offeringsKey = protectedQueryKey(queryScope, "offerings", "list");
  const offeringsQuery = useQuery({
    queryKey: offeringsKey,
    queryFn: () => offeringsApi.list(),
    enabled: Boolean(me?.id),
    staleTime: QUERY_STALE_MS.operational,
  });
  const offerings = offeringsQuery.data ?? [];

  useEffect(() => {
    setOfferingId((current) => {
      if (offerings.some((offering) => offering.id === current)) return current;
      const firstActive = offerings.find((offering) => offering.status === "Active") ?? offerings[0];
      return firstActive?.id ?? "";
    });
  }, [offerings]);

  const attendanceContext = offeringId && date ? `${offeringId}:${date}` : "";
  const sessionKey = protectedQueryKey(queryScope, "attendance", "session", offeringId || "none", date || "none");
  const historyKey = protectedQueryKey(queryScope, "attendance", "history", offeringId || "none");
  const sessionQuery = useQuery({
    queryKey: sessionKey,
    queryFn: () => offeringsApi.attendance(offeringId, date),
    enabled: Boolean(me?.id && offeringId && date),
    staleTime: QUERY_STALE_MS.review,
  });
  const historyQuery = useQuery({
    queryKey: historyKey,
    queryFn: () => offeringsApi.attendanceSessions(offeringId),
    enabled: Boolean(me?.id && offeringId),
    staleTime: QUERY_STALE_MS.operational,
  });

  const session: AttendanceSessionView | null = sessionQuery.data ?? null;
  const history: AttendanceSessionSummary[] = historyQuery.data ?? [];

  useEffect(() => {
    if (hydratedContextRef.current === attendanceContext) return;
    hydratedContextRef.current = attendanceContext;
    baselineRecordsRef.current = [];
    setRecords([]);
    setSavedMessage(null);
    setMutationError(null);
    setRollCallOpen(false);
    setRollCallSnapshot(null);
  }, [attendanceContext]);

  useEffect(() => {
    if (!session || !attendanceContext) return;
    if (session.offeringId !== offeringId || session.date !== date) return;
    if (hydratedContextRef.current !== attendanceContext) return;

    const dirty = !attendanceRecordsEqual(records, baselineRecordsRef.current);
    if (dirty) return;

    const nextRecords = cloneAttendanceRecords(session.records);
    baselineRecordsRef.current = cloneAttendanceRecords(session.records);
    setRecords(nextRecords);
  }, [attendanceContext, date, offeringId, records, session]);

  const selectedOffering = offerings.find((offering) => offering.id === offeringId) ?? null;
  const teachingWeek = getTeachingWeek(selectedOffering?.startDate, selectedOffering?.endDate, date);
  const counts = useMemo(() => getAttendanceCounts(records), [records]);
  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) =>
      record.studentName.toLowerCase().includes(query) || record.studentNumber.toLowerCase().includes(query),
    );
  }, [records, search]);

  const hasOfferings = offeringsQuery.data !== undefined;
  const hasSession = !offeringId || sessionQuery.data !== undefined;
  const hasHistory = !offeringId || historyQuery.data !== undefined;
  const hasData = hasOfferings && hasSession && hasHistory;
  const loading = meLoading || (!hasOfferings && offeringsQuery.isPending) || (Boolean(offeringId) && !hasSession && sessionQuery.isPending);
  const queryError = offeringsQuery.error ?? sessionQuery.error ?? historyQuery.error;
  const hardQueryError =
    (!hasOfferings && offeringsQuery.isError) ||
    (!hasSession && sessionQuery.isError) ||
    (!hasHistory && historyQuery.isError);
  const error = mutationError ?? (hardQueryError
    ? queryError instanceof ApiError
      ? queryError.message
      : "Failed to load attendance"
    : null);
  const isFetching = offeringsQuery.isFetching || sessionQuery.isFetching || historyQuery.isFetching;
  const isRefreshError = offeringsQuery.isError || sessionQuery.isError || historyQuery.isError;

  function updateRecord(
    studentId: string,
    patch: Partial<Pick<AttendanceRecordView, "status" | "permissionPending" | "permissionPendingSince" | "note">>,
  ) {
    setSavedMessage(null);
    setMutationError(null);
    setRecords((current) => updateAttendanceRecord(current, studentId, patch));
  }

  function setRecordMark(studentId: string, value: string) {
    if (value === PENDING_VALUE) {
      updateRecord(studentId, { status: null, permissionPending: true });
      return;
    }
    updateRecord(studentId, {
      status: (value || null) as AttendanceStatus | null,
      permissionPending: false,
      permissionPendingSince: null,
    });
  }

  function markAll(status: AttendanceStatus | null) {
    setSavedMessage(null);
    setMutationError(null);
    setRecords((current) => current.map((record) => ({
      ...record,
      status,
      permissionPending: false,
      permissionPendingSince: null,
    })));
  }

  async function save(): Promise<boolean> {
    if (!offeringId) return false;
    setSaving(true);
    setMutationError(null);
    setSavedMessage(null);
    try {
      const saved = await offeringsApi.saveAttendance(offeringId, date, { records: toSaveAttendanceRecords(records) });
      queryClient.setQueryData(sessionKey, saved);
      baselineRecordsRef.current = cloneAttendanceRecords(saved.records);
      setRecords(cloneAttendanceRecords(saved.records));
      await queryClient.invalidateQueries({ queryKey: historyKey, exact: true });
      setSavedMessage(`Attendance saved for ${formatSessionDate(date)}.`);
      return true;
    } catch (err) {
      setMutationError(err instanceof ApiError ? err.message : "Failed to save attendance");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function startRollCall() {
    setRollCallSnapshot(cloneAttendanceRecords(records));
    setRollCallOpen(true);
  }

  function requestRollCallClose() {
    const snapshot = rollCallSnapshot;
    const changed = snapshot !== null && !attendanceRecordsEqual(records, snapshot);
    if (changed) {
      const discard = window.confirm("Discard the unsaved Roll Call changes made since you opened this mode?");
      if (!discard) return;
      setRecords(cloneAttendanceRecords(snapshot));
    }
    setRollCallOpen(false);
    setRollCallSnapshot(null);
  }

  async function saveRollCallAndClose() {
    const saved = await save();
    if (!saved) return;
    setRollCallOpen(false);
    setRollCallSnapshot(null);
  }

  const sessionContext = selectedOffering
    ? `${selectedOffering.course?.title ?? selectedOffering.course?.code ?? "Course"} · Class ${selectedOffering.sectionCode} · ${teachingWeek ? `Week ${teachingWeek}` : "Week not scheduled"} · ${formatSessionDate(date)}`
    : "Select a class section to load attendance.";

  return (
    <>
      <Topbar title="Attendance" subtitle="Record section attendance by teaching date and keep a reusable attendance history." />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <p className="mb-4 text-sm font-medium text-foreground">{sessionContext}</p>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_160px_210px_minmax(0,1fr)]">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Class section</label>
                <select value={offeringId} onChange={(event) => setOfferingId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                  {offerings.length === 0 ? <option value="">No assigned classes</option> : null}
                  {offerings.map((offering) => <option key={offering.id} value={offering.id}>{offeringLabel(offering)}</option>)}
                </select>
                {selectedOffering?.course ? <p className="text-sm text-muted-foreground">{selectedOffering.course.title} · {selectedOffering.enrolledCount} enrolled</p> : null}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Week</label>
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/30 px-3 text-sm font-medium text-foreground">{teachingWeek ? `Week ${teachingWeek}` : "—"}</div>
                <p className="text-xs text-muted-foreground">Derived from the teaching period.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attendance date</label>
                <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
                <p className="text-xs text-muted-foreground">One register per section and date.</p>
              </div>
              <div className="space-y-2">
                <label htmlFor="attendance-search" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Student search</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input id="attendance-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or student ID" className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <p className="text-xs text-muted-foreground">Filters the overview table only.</p>
              </div>
            </div>
          </section>

          <QueryRefreshStatus
            hasData={hasData}
            isPending={!hasData && (offeringsQuery.isPending || sessionQuery.isPending || historyQuery.isPending)}
            isFetching={isFetching}
            isError={isRefreshError}
            label="Attendance"
          />
          {error ? <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}
          {savedMessage ? <div className="rounded-xl border border-status-live/30 bg-status-live-bg px-4 py-3 text-sm text-status-live">{savedMessage}</div> : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <SummaryCard icon={<UserCheck className="h-4 w-4" />} label="Present" value={counts.Present} />
            <SummaryCard icon={<UserMinus className="h-4 w-4" />} label="Absent" value={counts.Absent} />
            <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="Late" value={counts.Late} />
            <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Permission / Excused" value={counts.Excused} />
            <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="Permission Pending" value={counts.PermissionPending} />
            <SummaryCard icon={<UsersRound className="h-4 w-4" />} label="Unmarked" value={counts.Unmarked} />
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Attendance register</h2>
                <p className="mt-1 text-sm text-muted-foreground">Permission Pending means the student said they have permission but the paper letter has not yet been confirmed.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={startRollCall} disabled={records.length === 0 || loading || saving} className="inline-flex h-9 items-center gap-2 rounded-md border border-primary bg-primary/5 px-3 text-sm font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><Play className="h-4 w-4" /> Start Roll Call</button>
                <button type="button" onClick={() => markAll("Present")} disabled={records.length === 0 || saving} className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">Mark all present</button>
                <button type="button" onClick={() => markAll(null)} disabled={records.length === 0 || saving} className="h-9 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50">Clear marks</button>
                <button type="button" onClick={() => void save()} disabled={!offeringId || loading || saving || records.length === 0} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save attendance"}</button>
              </div>
            </div>

            {loading ? <div className="p-10 text-center text-sm text-muted-foreground">Loading attendance…</div> : records.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">This class has no enrolled students yet. Add students to the offering before recording attendance.</div> : filteredRecords.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No students match your search.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Student ID</th><th className="px-4 py-3">Student</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Note</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {filteredRecords.map((record) => (
                      <tr key={record.studentId} className="align-middle hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{record.studentNumber}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{record.studentName}</td>
                        <td className="px-4 py-3">
                          <select value={record.permissionPending ? PENDING_VALUE : record.status ?? ""} onChange={(event) => setRecordMark(record.studentId, event.target.value)} className={`h-9 min-w-[180px] rounded-md border px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring ${statusClass(record)}`}>
                            <option value="">Unmarked</option>
                            {ATTENDANCE_STATUSES.map((status) => <option key={status} value={status}>{attendanceStatusLabel(status)}</option>)}
                            <option value={PENDING_VALUE}>Permission Pending</option>
                          </select>
                        </td>
                        <td className="px-4 py-3"><input value={record.note} maxLength={300} placeholder={record.permissionPending ? "Optional pending-permission note" : "Optional note"} onChange={(event) => updateRecord(record.studentId, { note: event.target.value })} className="h-9 w-full min-w-[240px] rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-4"><h2 className="font-semibold text-foreground">Attendance history</h2><p className="mt-1 text-sm text-muted-foreground">Open any saved date to review or correct the register.</p></div>
            {history.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No attendance sessions have been saved for this class yet.</div> : (
              <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="bg-muted/30 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Present</th><th className="px-4 py-3">Absent</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Permission</th><th className="px-4 py-3">Pending</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-border">{history.map((item) => <tr key={item.sessionId} className="hover:bg-muted/20"><td className="px-4 py-3 font-medium text-foreground">{formatSessionDate(item.date)}</td><td className="px-4 py-3 tabular-nums">{item.counts.Present}</td><td className="px-4 py-3 tabular-nums">{item.counts.Absent}</td><td className="px-4 py-3 tabular-nums">{item.counts.Late}</td><td className="px-4 py-3 tabular-nums">{item.counts.Excused}</td><td className="px-4 py-3 tabular-nums">{item.counts.PermissionPending}</td><td className="px-4 py-3"><button type="button" onClick={() => setDate(item.date)} className="text-sm font-medium text-primary hover:underline">Open register</button></td></tr>)}</tbody></table></div>
            )}
          </section>

          {session?.updatedAt ? <p className="text-right text-xs text-muted-foreground">Last saved {new Date(session.updatedAt).toLocaleString()}</p> : null}
        </div>
      </main>

      <RollCallDialog open={rollCallOpen} offering={selectedOffering} date={date} week={teachingWeek} records={records} saving={saving} onUpdateRecord={updateRecord} onRequestClose={requestRollCallClose} onSaveAndClose={saveRollCallAndClose} />
    </>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div><p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p></div>;
}