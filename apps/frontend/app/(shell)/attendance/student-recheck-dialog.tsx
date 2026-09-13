"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  History,
  Save,
  UserRound,
} from "lucide-react";
import type {
  AttendanceCheckpointView,
  AttendanceRecordView,
  AttendanceSessionView,
  AttendanceStatus,
  RecheckAttendanceInput,
} from "@dse-pms/shared-types";
import { ATTENDANCE_STATUSES } from "@dse-pms/shared-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { offeringsApi } from "@/lib/offerings";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";
import { checkpointLabel } from "./attendance-recheck-state";

const PENDING_VALUE = "__permission_pending__";

interface StudentRecheckDialogProps {
  open: boolean;
  offeringId: string;
  date: string;
  record: AttendanceRecordView | null;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onSaved: (session: AttendanceSessionView) => void;
}

function markValue(mark: {
  status: AttendanceStatus | null;
  permissionPending: boolean;
} | null | undefined): string {
  if (!mark) return "";
  if (mark.permissionPending) return PENDING_VALUE;
  return mark.status ?? "";
}

function markInput(value: string, note: string): RecheckAttendanceInput["observation"] {
  if (value === PENDING_VALUE) {
    return { status: null, permissionPending: true, note };
  }
  return {
    status: value as AttendanceStatus,
    permissionPending: false,
    note,
  };
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
}

function checkpointTone(checkpoint: AttendanceCheckpointView | undefined): string {
  if (!checkpoint) return "border-border bg-muted/20";
  if (checkpoint.permissionPending) return "border-amber-300/60 bg-amber-50/40";
  if (checkpoint.status === "Present") return "border-status-live/30 bg-status-live-bg/50";
  if (checkpoint.status === "Absent") return "border-destructive/30 bg-destructive/5";
  if (checkpoint.status === "Late") return "border-status-upcoming/30 bg-status-upcoming-bg/50";
  return "border-border bg-muted/30";
}

export function StudentRecheckDialog({
  open,
  offeringId,
  date,
  record,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  onClose,
  onSaved,
}: StudentRecheckDialogProps) {
  const { me } = useMe();
  const [observedValue, setObservedValue] = useState("");
  const [finalValue, setFinalValue] = useState("");
  const [observationNote, setObservationNote] = useState("");
  const [finalNote, setFinalNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkpoints = record?.checkpoints ?? [];
  const check1 = checkpoints.find((checkpoint) => checkpoint.checkNumber === 1);
  const check2 = checkpoints.find((checkpoint) => checkpoint.checkNumber === 2);
  const currentFinalValue = record ? markValue(record) : "";

  useEffect(() => {
    if (!open || !record) return;
    setObservedValue("");
    setFinalValue("");
    setObservationNote("");
    setFinalNote(record.note);
    setError(null);
  }, [date, open, record?.studentId]);

  const historyKey = protectedQueryKey(
    { userId: me?.id ?? "pending" },
    "attendance",
    "student-history",
    offeringId || "none",
    record?.studentId ?? "none",
  );
  const historyQuery = useQuery({
    queryKey: historyKey,
    queryFn: () => offeringsApi.attendanceStudentHistory(offeringId, record!.studentId),
    enabled: Boolean(open && me?.id && offeringId && record?.studentId),
    staleTime: QUERY_STALE_MS.review,
  });

  const changedObservation = useMemo(() => {
    if (!check1 || !observedValue) return false;
    return markValue(check1) !== observedValue;
  }, [check1, observedValue]);

  function chooseObservation(value: string) {
    setObservedValue(value);
    setError(null);
    if (value === markValue(check1)) {
      setFinalValue(currentFinalValue || value);
    } else {
      // A changed observation has academic meaning that varies by programme
      // policy. Never infer the final mark; require the lecturer to choose it.
      setFinalValue("");
    }
  }

  function sameAsCheck1() {
    const value = markValue(check1);
    if (!value) return;
    setObservedValue(value);
    setFinalValue(currentFinalValue || value);
    setError(null);
  }

  async function submit() {
    if (!record || !observedValue || !finalValue || check2) return;
    setSubmitting(true);
    setError(null);
    try {
      const saved = await offeringsApi.recheckAttendance(offeringId, date, {
        studentId: record.studentId,
        observation: markInput(observedValue, observationNote),
        final: markInput(finalValue, finalNote),
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save Check 2");
    } finally {
      setSubmitting(false);
    }
  }

  const summary = record?.attendanceSummary ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className="left-auto right-0 top-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none p-0 sm:w-[540px] sm:max-w-[540px]"
      >
        <DialogTitle className="sr-only">Student attendance recheck</DialogTitle>
        <DialogDescription className="sr-only">
          Review the first attendance check, record Check 2, and explicitly confirm the final attendance status.
        </DialogDescription>

        {record ? (
          <div className="min-h-full bg-background">
            <header className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
              <div className="pr-8">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Individual attendance recheck
                </p>
                {record.studentKhmerName ? (
                  <h2 lang="km" className="mt-2 break-words text-3xl font-semibold leading-tight text-foreground">
                    {record.studentKhmerName}
                  </h2>
                ) : null}
                <h2 className={`${record.studentKhmerName ? "mt-0.5 text-xl" : "mt-2 text-3xl"} break-words font-semibold text-foreground`}>
                  {record.studentName}
                </h2>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono">{record.studentNumber ?? "Pending ID"}</span>
                  <span>Sex: {record.studentGender ?? "—"}</span>
                </div>
              </div>
            </header>

            <div className="space-y-5 p-5">
              <section className="grid grid-cols-2 gap-3">
                <CheckpointCard label="Check 1" checkpoint={check1} />
                <CheckpointCard label="Check 2" checkpoint={check2} />
              </section>

              <section className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Final attendance</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {record.permissionPending
                        ? "Permission Pending"
                        : record.status ?? "Unmarked"}
                    </p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Check 1 and Check 2 are audit observations. This final status remains the academic attendance result for this date.
                </p>
              </section>

              {summary ? (
                <section className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Course attendance</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                        {summary.attendanceRate === null ? "—" : `${summary.attendanceRate}%`}
                      </p>
                    </div>
                    <p className="text-right text-sm font-medium tabular-nums text-foreground">
                      {summary.attendedSessions} / {summary.markedSessions}
                      <span className="block text-xs font-normal text-muted-foreground">sessions attended</span>
                    </p>
                  </div>
                  {summary.badges.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {summary.badges.map((badge) => (
                        <span key={badge} className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground">
                          {badge}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {!check1 ? (
                <section className="rounded-xl border border-amber-300/50 bg-amber-50/40 p-4 text-sm text-amber-900">
                  Save the initial roll call first. Check 1 is created only from the first saved observation and is never manufactured from older attendance history.
                </section>
              ) : check2 ? (
                <section className="rounded-xl border border-status-live/30 bg-status-live-bg p-4 text-sm text-status-live">
                  Check 2 is complete. The two observations stay immutable even if the final attendance status is corrected later.
                </section>
              ) : (
                <section className="space-y-4 rounded-xl border border-primary/25 bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">Record Check 2</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Observe the student again, then explicitly confirm the final attendance mark.</p>
                    </div>
                    <button
                      type="button"
                      onClick={sameAsCheck1}
                      className="min-h-10 rounded-md border border-primary/30 px-3 text-xs font-semibold text-primary hover:bg-primary/5"
                    >
                      Same as Check 1
                    </button>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Observed now</p>
                    <div className="grid grid-cols-2 gap-2">
                      {ATTENDANCE_STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => chooseObservation(status)}
                          className={`min-h-11 rounded-md border px-3 text-sm font-semibold ${observedValue === status ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}
                        >
                          {status === "Excused" ? "Permission / Excused" : status}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => chooseObservation(PENDING_VALUE)}
                        className={`col-span-2 min-h-11 rounded-md border px-3 text-sm font-semibold ${observedValue === PENDING_VALUE ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}
                      >
                        Permission Pending
                      </button>
                    </div>
                  </div>

                  <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Check 2 note
                    <input
                      value={observationNote}
                      maxLength={300}
                      onChange={(event) => setObservationNote(event.target.value)}
                      placeholder="Optional observation note"
                      className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>

                  {observedValue ? (
                    <div className={`rounded-lg border p-3 ${changedObservation ? "border-amber-300/60 bg-amber-50/40" : "border-border bg-muted/20"}`}>
                      <p className="text-sm font-medium text-foreground">
                        {changedObservation ? "Observation changed from Check 1" : "Observation matches Check 1"}
                      </p>
                      {changedObservation ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Choose the final academic attendance below. The PMS will not automatically infer Late, Present, or another result.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Confirm final attendance
                    <select
                      value={finalValue}
                      onChange={(event) => setFinalValue(event.target.value)}
                      className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Choose final status…</option>
                      {ATTENDANCE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status === "Excused" ? "Permission / Excused" : status}
                        </option>
                      ))}
                      <option value={PENDING_VALUE}>Permission Pending</option>
                    </select>
                  </label>

                  <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Final note
                    <input
                      value={finalNote}
                      maxLength={300}
                      onChange={(event) => setFinalNote(event.target.value)}
                      placeholder="Optional final attendance note"
                      className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>

                  {error ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {error}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={!observedValue || !finalValue || submitting}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {submitting ? "Saving Check 2…" : "Save Check 2 & final status"}
                  </button>
                </section>
              )}

              <section className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">Recent attendance</h3>
                </div>
                {historyQuery.isPending ? (
                  <p className="mt-3 text-sm text-muted-foreground">Loading history…</p>
                ) : historyQuery.isError ? (
                  <p className="mt-3 text-sm text-destructive">Could not load recent attendance.</p>
                ) : historyQuery.data?.history.length ? (
                  <div className="mt-3 divide-y divide-border">
                    {historyQuery.data.history.slice(0, 6).map((item) => (
                      <div key={item.sessionId} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                        <div>
                          <p className="font-medium text-foreground">{formatDate(item.date)}</p>
                          {item.note ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.note}</p> : null}
                        </div>
                        <span className="text-right font-medium text-foreground">
                          {item.permissionPending ? "Permission Pending" : item.status ?? "Unmarked"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No saved attendance history yet.</p>
                )}
              </section>
            </div>

            <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
              <button
                type="button"
                onClick={onPrevious}
                disabled={!hasPrevious}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </button>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <UserRound className="h-4 w-4" /> Student
              </div>
              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground disabled:opacity-40"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            </footer>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CheckpointCard({
  label,
  checkpoint,
}: {
  label: string;
  checkpoint: AttendanceCheckpointView | undefined;
}) {
  return (
    <div className={`rounded-xl border p-3 ${checkpointTone(checkpoint)}`}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-2 font-semibold text-foreground">{checkpointLabel(checkpoint)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {checkpoint ? formatTime(checkpoint.checkedAt) : "Not recorded"}
      </p>
    </div>
  );
}
