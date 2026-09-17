import { CheckCircle2, Clock3, UserCheck, UserMinus, UsersRound } from "lucide-react";
import type { getAttendanceCounts } from "./roll-call-state";

type Counts = ReturnType<typeof getAttendanceCounts>;

const STATUS_ITEMS = [
  { key: "Present", label: "Present", icon: UserCheck, tone: "text-status-live" },
  { key: "Absent", label: "Absent", icon: UserMinus, tone: "text-destructive" },
  { key: "Late", label: "Late", icon: Clock3, tone: "text-status-upcoming" },
  { key: "Excused", label: "Excused", icon: CheckCircle2, tone: "text-muted-foreground" },
  { key: "PermissionPending", label: "Permission pending", icon: Clock3, tone: "text-amber-700" },
  { key: "Unmarked", label: "Unmarked", icon: UsersRound, tone: "text-muted-foreground" },
] as const;

export function AttendanceSummary({ counts, hasUnsavedChanges, saving }: {
  counts: Counts;
  hasUnsavedChanges: boolean;
  saving: boolean;
}) {
  const marked = counts.Total - counts.Unmarked;
  const percentage = counts.Total > 0 ? Math.round((marked / counts.Total) * 100) : 0;

  return (
    <section aria-label="Attendance summary" className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-foreground">Attendance progress</h2>
          <span className="text-sm font-semibold tabular-nums text-foreground">{marked} / {counts.Total} marked</span>
          <span className="text-xs tabular-nums text-muted-foreground">{percentage}%</span>
        </div>
        <span role="status" className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${hasUnsavedChanges ? "border-amber-300 bg-amber-50 text-amber-900" : "border-status-live/30 bg-status-live-bg text-status-live"}`}>
          {saving ? "Saving…" : hasUnsavedChanges ? "Unsaved changes" : "No unsaved changes"}
        </span>
      </div>
      <div role="progressbar" aria-label="Students marked" aria-valuemin={0} aria-valuemax={counts.Total} aria-valuenow={marked} className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {STATUS_ITEMS.map(({ key, label, icon: Icon, tone }) => (
          <div key={key} className="flex min-w-0 items-center gap-2 rounded-md bg-muted/35 px-2.5 py-2">
            <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${tone}`} />
            <dt className="min-w-0 flex-1 text-xs leading-tight text-muted-foreground">{label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">{counts[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
