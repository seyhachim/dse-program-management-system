import type { AttendanceWeek, AttendanceWeekOverview } from "./attendance-week-progress";

const TONES: Record<AttendanceWeek["status"], string> = {
  saved: "bg-emerald-600 text-white hover:bg-emerald-700",
  missing: "bg-red-600 text-white hover:bg-red-700",
  current: "bg-amber-400 text-amber-950 hover:bg-amber-500",
  future: "bg-muted/60 text-muted-foreground",
  "no-class": "border border-dashed border-border bg-muted/20 text-muted-foreground",
};

function describeWeek(item: AttendanceWeek): string {
  if (item.status === "no-class") return `Week ${item.week}: No recurring class scheduled`;
  if (item.status === "future") return `Week ${item.week}: Upcoming week`;
  const details = `${item.saved} of ${item.dates.length} scheduled attendance dates saved`;
  if (item.status === "saved") return `Week ${item.week}: Saved; ${details}`;
  if (item.status === "missing") return `Week ${item.week}: Missing attendance; ${details}`;
  return `Week ${item.week}: Current week; ${details}`;
}

/**
 * A compact read-only overview of persisted attendance, not a declaration that
 * teaching was (or was not) delivered. No class cancellation is inferred here.
 */
export function AttendanceWeekProgress({
  overview, selectedWeek, historyReady, disabled, onSelectDate,
}: {
  overview: AttendanceWeekOverview;
  selectedWeek: number | null;
  historyReady: boolean;
  disabled: boolean;
  onSelectDate: (date: string) => void;
}) {
  if (overview.weeks.length === 0) return null;
  const savedWeeks = overview.weeks.filter((item) => item.status === "saved").length;

  return (
    <section aria-label="Semester attendance overview" className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Semester attendance · 16 weeks</h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {historyReady ? `${savedWeeks} / 16 weeks recorded` : "Loading saved attendance…"}
        </span>
      </div>
      <div role="group" aria-label="16-week attendance record progress" className="grid grid-cols-8 gap-1.5 sm:grid-cols-16">
        {overview.weeks.map((item) => {
          // History must be loaded successfully before claiming a missing or saved record.
          const tone = historyReady ? TONES[item.status] : TONES.future;
          const selectable = item.week <= overview.currentWeek && Boolean(item.targetDate);
          return (
            <button
              key={item.week}
              type="button"
              title={historyReady ? describeWeek(item) : `Week ${item.week}: Loading attendance history`}
              aria-label={historyReady ? describeWeek(item) : `Week ${item.week}: Loading attendance history`}
              aria-current={selectedWeek === item.week ? "date" : undefined}
              onClick={() => { if (item.targetDate) onSelectDate(item.targetDate); }}
              disabled={disabled || !selectable}
              className={`flex h-9 min-w-0 items-center justify-center rounded text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default ${tone} ${selectedWeek === item.week ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
            >
              {item.week}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <Legend color="bg-emerald-600" label="Saved" />
        <Legend color="bg-red-600" label="Past date missing attendance" />
        <Legend color="bg-amber-400" label="Current / awaiting class" />
        <Legend color="bg-muted border border-border" label="Future / no scheduled class" />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Based on saved attendance registers, not proof that a class was held or cancelled.</p>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span>;
}
