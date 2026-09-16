"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttendanceRecordView, OfferingView } from "@dse-pms/shared-types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@dse-pms/ui";
import { RollCallDialog as ActiveRollCallDialog } from "./roll-call-dialog-base";

interface RollCallDialogProps {
  open: boolean;
  offering: OfferingView | null;
  date: string;
  week: number | null;
  records: AttendanceRecordView[];
  saving: boolean;
  saveError: string | null;
  onUpdateRecord: (
    studentId: string,
    patch: Partial<Pick<AttendanceRecordView, "status" | "permissionPending" | "permissionPendingSince" | "note">>,
  ) => void;
  onRequestClose: () => void;
  onSaveAndClose: () => Promise<void>;
}

function formatAttendanceDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric", weekday: "short",
  }).format(parsed);
}

export function RollCallDialog(props: RollCallDialogProps) {
  const { open, offering, date, week, records, onRequestClose } = props;
  const contextKey = useMemo(() => `${offering?.id ?? "none"}:${date}`, [date, offering?.id]);
  const [confirmedContext, setConfirmedContext] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setConfirmedContext(null);
  }, [open]);

  useEffect(() => {
    if (confirmedContext && confirmedContext !== contextKey) setConfirmedContext(null);
  }, [confirmedContext, contextKey]);

  if (!open) return null;
  if (confirmedContext === contextKey) return <ActiveRollCallDialog {...props} />;

  const courseTitle = offering?.course?.title ?? offering?.course?.code ?? "Course";
  const courseCode = offering?.course?.code ?? "Course";
  const sectionCode = offering?.sectionCode ?? "—";
  const weekLabel = week ? `Week ${week}` : "Week not scheduled";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onRequestClose(); }}>
      <DialogContent className="max-w-xl p-0" showCloseButton={false}>
        <div className="overflow-hidden rounded-lg">
          <div className="border-b border-border bg-primary/5 px-6 py-5">
            <DialogTitle className="text-xl font-semibold text-foreground">Confirm class before marking attendance</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">Check the course and class carefully. Roll Call shortcuts stay disabled until you confirm.</DialogDescription>
          </div>
          <div className="space-y-5 px-6 py-6">
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">You are taking attendance for</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{courseTitle}</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">{courseCode}</span>
                <span className="rounded-full border border-primary/30 bg-background px-3 py-1 text-sm font-semibold text-foreground">Class {sectionCode}</span>
              </div>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-border bg-muted/30 p-3"><dt className="text-xs text-muted-foreground">Teaching week</dt><dd className="mt-1 font-semibold text-foreground">{weekLabel}</dd></div>
              <div className="rounded-lg border border-border bg-muted/30 p-3"><dt className="text-xs text-muted-foreground">Attendance date</dt><dd className="mt-1 font-semibold text-foreground">{formatAttendanceDate(date)}</dd></div>
              <div className="rounded-lg border border-border bg-muted/30 p-3"><dt className="text-xs text-muted-foreground">Students</dt><dd className="mt-1 font-semibold tabular-nums text-foreground">{records.length}</dd></div>
            </dl>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={onRequestClose} className="h-11 rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted">Cancel</button>
              <button type="button" disabled={!offering || records.length === 0} onClick={() => setConfirmedContext(contextKey)} className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">Start {courseCode} {sectionCode} Roll Call</button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
