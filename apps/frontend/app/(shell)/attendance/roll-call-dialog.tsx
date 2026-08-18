"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileCheck2,
  Save,
  SkipForward,
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
    patch: Partial<Pick<AttendanceRecordView, "status" | "note">>,
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
    className: "border-status-live/40 bg-status-live-bg text-status-live hover:bg-status-live-bg/70",
  },
  {
    status: "Late",
    label: "Late",
    shortcut: "L",
    icon: Clock3,
    className: "border-status-upcoming/40 bg-status-upcoming-bg text-status-upcoming hover:bg-status-upcoming-bg/70",
  },
  {
    status: "Absent",
    label: "Absent",
    shortcut: "A",
    icon: XCircle,
    className: "border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10",
  },
  {
    status: "Excused",
    label: "Excused Absence",
    shortcut: "E",
    icon: FileCheck2,
    className: "border-border bg-muted/50 text-foreground hover:bg-muted",
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

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setReviewStudentIds(null);
    setFeedback(null);
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
    const label = status === "Excused" ? "Excused Absence" : status;
    onUpdateRecord(current.studentId, { status });
    setFeedback(`${current.studentName} marked ${label}.`);
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

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onRequestClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="h-[min(92vh,860px)] max-h-[92vh] w-[min(1120px,94vw)] max-w-none gap-0 overflow-hidden p-0 text-sm shadow-2xl"
      >
        <DialogTitle className="sr-only">Roll Call Mode</DialogTitle>
        <DialogDescription className="sr-only">
          Mark attendance one student at a time. Keyboard shortcuts are P for Present, L for Late, A for Absent,
          E for Excused Absence, S to Skip, and the left and right arrows to navigate students.
        </DialogDescription>

        <div className="flex h-full min-h-0 flex-col">
          <header className="flex flex-col gap-3 border-b border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">Roll Call Mode</h2>
                <span className="rounded-full border border-status-live/30 bg-status-live-bg px-2 py-0.5 text-xs font-medium text-status-live">
                  Live
                </span>
                {reviewStudentIds ? (
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Unmarked review
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-medium text-foreground">
                {courseTitle} · Class {offering?.sectionCode ?? "—"}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {weekLabel} · {formatAttendanceDate(date)} · {sequence.length === 0 ? 0 : index + 1} / {sequence.length}
              </p>
            </div>
            <button
              type="button"
              onClick={onRequestClose}
              className="h-10 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              Close
            </button>
          </header>

          <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="flex min-h-0 flex-col overflow-y-auto px-5 py-6 sm:px-8 lg:px-10">
              {feedback ? (
                <div aria-live="polite" className="mb-5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
                  {feedback}
                </div>
              ) : (
                <div aria-live="polite" className="sr-only" />
              )}

              {current ? (
                <>
                  <div className="flex flex-1 flex-col items-center justify-center text-center">
                    <div className="mb-5 flex h-28 w-28 items-center justify-center rounded-full border border-border bg-muted text-3xl font-semibold text-foreground sm:h-32 sm:w-32 sm:text-4xl">
                      {initials(current.studentName) || <UserRound className="h-12 w-12" />}
                    </div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Student {sequence.length === 0 ? 0 : index + 1} of {sequence.length}
                    </p>
                    <h3 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                      {current.studentName}
                    </h3>
                    <p className="mt-4 font-mono text-base text-muted-foreground">{current.studentNumber}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Current status:{" "}
                      <span className="font-medium text-foreground">
                        {current.status === "Excused" ? "Excused Absence" : current.status ?? "Unmarked"}
                      </span>
                    </p>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {STATUS_ACTIONS.map((action) => {
                      const Icon = action.icon;
                      const selected = current.status === action.status;
                      return (
                        <button
                          key={action.status}
                          type="button"
                          onClick={() => mark(action.status)}
                          aria-pressed={selected}
                          className={`relative min-h-24 rounded-xl border px-4 py-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-ring ${action.className} ${selected ? "ring-2 ring-ring" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Icon className="h-6 w-6" />
                            <kbd className="rounded border border-current/20 px-1.5 py-0.5 text-[11px] font-semibold opacity-80">
                              {action.shortcut}
                            </kbd>
                          </div>
                          <div className="mt-3 font-semibold">{action.label}</div>
                          {selected ? (
                            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium">
                              <Check className="h-3.5 w-3.5" /> Selected
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={skip}
                      className="min-h-24 rounded-xl border border-border bg-background px-4 py-4 text-left text-foreground outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <SkipForward className="h-6 w-6" />
                        <kbd className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          S
                        </kbd>
                      </div>
                      <div className="mt-3 font-semibold">Skip</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {current.status === null ? "Leave Unmarked" : "Keep existing status"}
                      </div>
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Attendance note</span>
                      <input
                        value={current.note}
                        maxLength={300}
                        placeholder="Optional note or approved absence reason"
                        onChange={(event) => onUpdateRecord(current.studentId, { note: event.target.value })}
                        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={previous}
                      disabled={index === 0}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" /> Previous
                    </button>
                    <button
                      type="button"
                      onClick={next}
                      disabled={index >= sequence.length - 1}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <CheckCircle2 className="h-14 w-14 text-status-live" />
                  <h3 className="mt-4 text-2xl font-semibold text-foreground">No students in this pass</h3>
                  <p className="mt-2 max-w-md text-sm text-muted-foreground">
                    There are no students to review in the current roll-call pass.
                  </p>
                </div>
              )}
            </section>

            <aside className="min-h-0 overflow-y-auto border-t border-border bg-muted/20 p-5 lg:border-l lg:border-t-0 lg:p-6">
              <h3 className="font-semibold text-foreground">Attendance summary</h3>
              <p className="mt-1 text-xs text-muted-foreground">Updates immediately as you mark students.</p>
              <div className="mt-5 space-y-2">
                <SummaryRow label="Present" value={counts.Present} />
                <SummaryRow label="Late" value={counts.Late} />
                <SummaryRow label="Absent" value={counts.Absent} />
                <SummaryRow label="Excused Absence" value={counts.Excused} />
                <SummaryRow label="Unmarked" value={counts.Unmarked} emphasized={counts.Unmarked > 0} />
                <div className="my-3 border-t border-border" />
                <SummaryRow label="Total" value={counts.Total} />
              </div>

              {counts.Unmarked > 0 ? (
                <button
                  type="button"
                  onClick={reviewUnmarked}
                  className="mt-5 w-full rounded-md border border-border bg-background px-4 py-3 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Review Unmarked Students ({counts.Unmarked})
                </button>
              ) : (
                <div className="mt-5 rounded-lg border border-status-live/30 bg-status-live-bg px-3 py-3 text-sm font-medium text-status-live">
                  Everyone has a status.
                </div>
              )}

              <div className="mt-6 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Keyboard shortcuts</p>
                <p className="mt-2 leading-5">P Present · L Late · A Absent · E Excused · S Skip</p>
                <p className="leading-5">← Previous · → Next</p>
              </div>

              <button
                type="button"
                onClick={() => void onSaveAndClose()}
                disabled={saving || records.length === 0}
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save Attendance"}
              </button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Unmarked students remain unmarked and are not converted to Absent.
              </p>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryRow({ label, value, emphasized = false }: { label: string; value: number; emphasized?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-md px-3 py-2 ${
        emphasized ? "bg-status-upcoming-bg" : "bg-background"
      }`}
    >
      <span className={emphasized ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
