"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  HelpCircle,
  LogOut,
  Save,
  SkipForward,
  Star,
  Trophy,
  UserRound,
  XCircle,
} from "lucide-react";
import type { AttendanceRecordView, AttendanceStatus, OfferingView } from "@dse-pms/shared-types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@dse-pms/ui";
import {
  getAttendanceCounts,
  getNextIndex,
  getPreviousIndex,
  getSkipFeedback,
  getUnmarkedStudentIds,
} from "./roll-call-state";

interface RollCallDialogProps {
  open: boolean;
  offering: OfferingView | null;
  date: string;
  week: number | null;
  records: AttendanceRecordView[];
  saving: boolean;
  onUpdateRecord: (
    studentId: string,
    patch: Partial<Pick<AttendanceRecordView, "status" | "permissionPending" | "permissionPendingSince" | "note">>,
  ) => void;
  onRequestClose: () => void;
  onSaveAndClose: () => Promise<void>;
}

const STATUS_ACTIONS: Array<{
  status: AttendanceStatus;
  label: string;
  shortcut: string;
  icon: typeof CheckCircle2;
  className: string;
}> = [
  {
    status: "Present",
    label: "Present",
    shortcut: "P",
    icon: CheckCircle2,
    className: "border-status-live/35 bg-status-live-bg text-status-live hover:bg-status-live-bg/70",
  },
  {
    status: "Late",
    label: "Late",
    shortcut: "L",
    icon: Clock3,
    className: "border-status-upcoming/35 bg-status-upcoming-bg text-status-upcoming hover:bg-status-upcoming-bg/70",
  },
  {
    status: "Absent",
    label: "Absent",
    shortcut: "A",
    icon: XCircle,
    className: "border-destructive/35 bg-destructive/5 text-destructive hover:bg-destructive/10",
  },
  {
    status: "Excused",
    label: "Excused",
    shortcut: "E",
    icon: FileCheck2,
    className: "border-border bg-muted/45 text-foreground hover:bg-muted",
  },
];

function formatAttendanceDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short",
  }).format(parsed);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

function BadgeIcon({ title }: { title: string }) {
  if (title === "Perfect Attendance") return <Trophy className="h-3.5 w-3.5" />;
  if (title === "Reliable Learner") return <Star className="h-3.5 w-3.5" />;
  return <Award className="h-3.5 w-3.5" />;
}

export function RollCallDialog({
  open,
  offering,
  date,
  week,
  records,
  saving,
  onUpdateRecord,
  onRequestClose,
  onSaveAndClose,
}: RollCallDialogProps) {
  const [index, setIndex] = useState(0);
  const [reviewStudentIds, setReviewStudentIds] = useState<string[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setReviewStudentIds(null);
    setFeedback(null);
    setShortcutsOpen(false);
  }, [open, offering?.id, date]);

  const counts = useMemo(() => getAttendanceCounts(records), [records]);
  const sequence = useMemo(
    () => reviewStudentIds ?? records.map((record) => record.studentId),
    [records, reviewStudentIds],
  );
  const currentStudentId = sequence[index] ?? null;
  const current = currentStudentId
    ? records.find((record) => record.studentId === currentStudentId) ?? null
    : null;
  const courseTitle = offering?.course?.title ?? offering?.course?.code ?? "Course";
  const weekLabel = week ? `Week ${week}` : "Week not scheduled";
  const markedCount = counts.Total - counts.Unmarked;
  const rollCallProgress = counts.Total === 0 ? 0 : Math.round((markedCount / counts.Total) * 100);

  function previous() {
    setFeedback(null);
    setIndex((currentIndex) => getPreviousIndex(currentIndex, sequence.length));
  }

  function next() {
    setFeedback(null);
    setIndex((currentIndex) => getNextIndex(currentIndex, sequence.length));
  }

  function mark(status: AttendanceStatus) {
    if (!current) return;
    const label = status === "Excused" ? "Permission / Excused" : status;
    onUpdateRecord(current.studentId, {
      status,
      permissionPending: false,
      permissionPendingSince: null,
    });
    setFeedback(`${current.studentName} marked ${label}.`);
    setIndex((currentIndex) => getNextIndex(currentIndex, sequence.length));
  }

  function markPermissionPending() {
    if (!current) return;
    onUpdateRecord(current.studentId, {
      status: null,
      permissionPending: true,
    });
    setFeedback(`${current.studentName} marked Permission Pending.`);
    setIndex((currentIndex) => getNextIndex(currentIndex, sequence.length));
  }

  function skip() {
    if (!current) return;
    setFeedback(getSkipFeedback(current));
    setIndex((currentIndex) => getNextIndex(currentIndex, sequence.length));
  }

  function reviewUnmarked() {
    const ids = getUnmarkedStudentIds(records);
    setReviewStudentIds(ids);
    setIndex(0);
    setFeedback(ids.length > 0 ? `Reviewing ${ids.length} unmarked student${ids.length === 1 ? "" : "s"}.` : null);
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        mark("Present");
      } else if (key === "l") {
        event.preventDefault();
        mark("Late");
      } else if (key === "a") {
        event.preventDefault();
        mark("Absent");
      } else if (key === "e") {
        event.preventDefault();
        mark("Excused");
      } else if (key === "r") {
        event.preventDefault();
        markPermissionPending();
      } else if (key === "s") {
        event.preventDefault();
        skip();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        previous();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const currentLabel = current?.permissionPending
    ? "Permission Pending"
    : current?.status === "Excused"
      ? "Permission / Excused"
      : current?.status ?? "Unmarked";
  const history = current?.attendanceSummary ?? null;
  const historyRate = history?.attendanceRate ?? null;
  const historyProgress = Math.max(0, Math.min(100, historyRate ?? 0));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onRequestClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-none gap-0 overflow-hidden rounded-none border-0 p-0 text-sm shadow-none sm:max-w-none"
      >
        <DialogTitle className="sr-only">Roll Call Mode</DialogTitle>
        <DialogDescription className="sr-only">
          Mark attendance one student at a time. Keyboard shortcuts are P for Present, L for Late, A for Absent,
          E for Excused, R for Permission Pending, S to Skip, and the left and right arrows to navigate students.
        </DialogDescription>

        <div className="flex h-full min-h-0 flex-col bg-background">
          <header className="flex min-h-20 items-center justify-between gap-4 border-b border-border bg-card px-6 py-3 lg:px-9">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">Roll Call Mode</h2>
                <span className="rounded-full border border-status-live/30 bg-status-live-bg px-2 py-0.5 text-xs font-medium text-status-live">Live</span>
                {reviewStudentIds ? <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Unmarked review</span> : null}
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{courseTitle}</span> · Class {offering?.sectionCode ?? "—"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <p className="font-medium text-foreground">{weekLabel}</p>
                <p>{formatAttendanceDate(date)}</p>
              </div>
              <div className="relative">
                <button type="button" onClick={() => setShortcutsOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                  <HelpCircle className="h-4 w-4" /> <span className="hidden sm:inline">Shortcuts</span>
                </button>
                {shortcutsOpen ? (
                  <div className="absolute right-0 top-12 z-20 w-64 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground shadow-lg">
                    <p className="font-semibold text-foreground">Keyboard shortcuts</p>
                    <p className="mt-2 leading-5">P Present · L Late · A Absent · E Excused</p>
                    <p className="leading-5">R Permission Pending · S Skip</p>
                    <p className="leading-5">← Previous · → Next</p>
                  </div>
                ) : null}
              </div>
              <button type="button" onClick={onRequestClose} className="inline-flex h-10 items-center gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 font-medium text-destructive outline-none hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring">
                <LogOut className="h-4 w-4" /> Exit
              </button>
            </div>
          </header>

          <div className="flex items-center gap-4 border-b border-border bg-card px-6 py-2.5 lg:px-9">
            <p className="shrink-0 text-xs font-medium text-muted-foreground">Marked: <span className="text-foreground">{markedCount} of {counts.Total}</span></p>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${rollCallProgress}%` }} />
            </div>
            <span className="w-10 text-right text-xs font-semibold tabular-nums text-foreground">{rollCallProgress}%</span>
          </div>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_260px]">
            <section className="flex min-h-0 flex-col overflow-y-auto px-5 py-5 sm:px-8 lg:px-10">
              {feedback ? <div aria-live="polite" className="mx-auto mb-2 max-w-2xl rounded-full bg-muted/60 px-4 py-1.5 text-center text-xs text-muted-foreground">{feedback}</div> : <div aria-live="polite" className="sr-only" />}

              {current ? (
                <>
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-full border border-border bg-muted text-3xl font-semibold text-foreground sm:h-28 sm:w-28 sm:text-4xl">
                      {initials(current.studentName) || <UserRound className="h-10 w-10" />}
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Student {sequence.length === 0 ? 0 : index + 1} of {sequence.length}</p>

                    {current.studentKhmerName ? (
                      <h3 lang="km" className="mt-3 max-w-4xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
                        {current.studentKhmerName}
                      </h3>
                    ) : null}
                    <h3 className={`${current.studentKhmerName ? "mt-1" : "mt-3"} max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]`}>
                      {current.studentName}
                    </h3>

                    <div className="mt-5 w-full max-w-2xl rounded-xl border border-border bg-muted/25 px-5 py-3 text-left">
                      {history && historyRate !== null ? (
                        <div className="grid items-center gap-3 sm:grid-cols-[auto_1fr_auto]">
                          <div>
                            <p className="text-xs text-muted-foreground">Attendance this course</p>
                            <p className="text-2xl font-semibold tabular-nums text-foreground">{historyRate}%</p>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-status-live transition-[width]" style={{ width: `${historyProgress}%` }} />
                          </div>
                          <p className="text-right text-sm font-semibold tabular-nums text-foreground">{history.attendedSessions} / {history.markedSessions}<span className="block text-[11px] font-normal text-muted-foreground">sessions attended</span></p>
                        </div>
                      ) : (
                        <p className="text-center text-sm text-muted-foreground">No finalized attendance history yet</p>
                      )}
                    </div>

                    {history?.badges.length ? (
                      <div className="mt-2.5 flex flex-wrap justify-center gap-2">
                        {history.badges.map((badge) => (
                          <span key={badge} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground">
                            <BadgeIcon title={badge} /> {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <p className="mt-3 text-sm text-muted-foreground">Current status: <span className="font-semibold text-foreground">{currentLabel}</span></p>
                  </div>

                  <div className="mx-auto mt-4 grid w-full max-w-5xl grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                    {STATUS_ACTIONS.map((action) => {
                      const Icon = action.icon;
                      const selected = current.status === action.status && !current.permissionPending;
                      return (
                        <button key={action.status} type="button" onClick={() => mark(action.status)} aria-pressed={selected} className={`relative min-h-20 rounded-lg border px-3 py-2.5 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${action.className} ${selected ? "ring-2 ring-ring" : ""}`}>
                          <div className="flex items-center justify-center gap-2"><Icon className="h-5 w-5" /><span className="font-semibold">{action.label}</span></div>
                          <kbd className="mt-2 inline-block rounded border border-current/20 px-1.5 py-0.5 text-[10px] font-semibold opacity-75">{action.shortcut}</kbd>
                          {selected ? <span className="sr-only">Selected</span> : null}
                        </button>
                      );
                    })}
                    <button type="button" onClick={markPermissionPending} aria-pressed={current.permissionPending} className={`min-h-20 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-center text-amber-900 outline-none transition hover:bg-amber-100 focus-visible:ring-2 focus-visible:ring-ring ${current.permissionPending ? "ring-2 ring-ring" : ""}`}>
                      <div className="flex items-center justify-center gap-2"><Clock3 className="h-5 w-5" /><span className="font-semibold leading-tight">Permission Pending</span></div>
                      <kbd className="mt-2 inline-block rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-semibold">R</kbd>
                    </button>
                    <button type="button" onClick={skip} className="min-h-20 rounded-lg border border-border bg-background px-3 py-2.5 text-center text-foreground outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="flex items-center justify-center gap-2"><SkipForward className="h-5 w-5" /><span className="font-semibold">Skip</span></div>
                      <kbd className="mt-2 inline-block rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">S</kbd>
                    </button>
                  </div>

                  <div className="mx-auto mt-3 grid w-full max-w-5xl gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <label className="sr-only" htmlFor="roll-call-note">Attendance note</label>
                    <input id="roll-call-note" value={current.note} maxLength={300} placeholder={current.permissionPending ? "Add a note about pending permission…" : "Add a note (optional)…"} onChange={(event) => onUpdateRecord(current.studentId, { note: event.target.value })} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    <button type="button" onClick={previous} disabled={index === 0} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button>
                    <button type="button" onClick={next} disabled={index >= sequence.length - 1} className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 font-semibold text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center text-center"><CheckCircle2 className="h-14 w-14 text-status-live" /><h3 className="mt-4 text-2xl font-semibold text-foreground">No students in this pass</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">There are no students to review in the current roll-call pass.</p></div>
              )}
            </section>

            <aside className="min-h-0 overflow-y-auto border-t border-border bg-muted/15 p-4 lg:border-l lg:border-t-0">
              <h3 className="font-semibold text-foreground">Class Summary</h3>
              <div className="mt-3 space-y-1">
                <SummaryRow label="Present" value={counts.Present} dotClass="bg-status-live" />
                <SummaryRow label="Late" value={counts.Late} dotClass="bg-status-upcoming" />
                <SummaryRow label="Absent" value={counts.Absent} dotClass="bg-destructive" />
                <SummaryRow label="Excused" value={counts.Excused} dotClass="bg-muted-foreground" />
                <SummaryRow label="Permission" value={counts.PermissionPending} dotClass="bg-primary" />
                <SummaryRow label="Unmarked" value={counts.Unmarked} dotClass="bg-border" />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground"><span>Total Students</span><span className="font-semibold tabular-nums text-foreground">{counts.Total}</span></div>

              {counts.Unmarked > 0 ? <button type="button" onClick={reviewUnmarked} className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">Review Unmarked ({counts.Unmarked})</button> : <div className="mt-4 rounded-md border border-status-live/25 bg-status-live-bg px-3 py-2 text-xs font-medium text-status-live">Everyone has a status.</div>}

              {current ? (
                <div className="mt-4 rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-semibold text-foreground">Student Info</p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs"><span className="text-muted-foreground">ID</span><span className="truncate font-medium text-foreground">{current.studentNumber ?? "—"}</span></div>
                </div>
              ) : null}

              <button type="button" onClick={() => void onSaveAndClose()} disabled={saving || records.length === 0} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save Attendance"}</button>
              <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground">Permission Pending remains unresolved until an authorized lecturer changes it.</p>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value, dotClass }: { label: string; value: number; dotClass: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-background px-2.5 py-2 text-xs">
      <span className="inline-flex items-center gap-2 text-muted-foreground"><span className={`h-2 w-2 rounded-full ${dotClass}`} />{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
