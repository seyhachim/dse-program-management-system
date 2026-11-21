"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { StudentAcademicCalendarView } from "@dse-pms/shared-types";
import {
  buildKhmerLunarMonthCells,
  cambodiaTodayDateKey,
  formatGregorianCalendarDate,
  khmerLunarDisplay,
  monthHeading,
  publishedItemsOnDate,
  shiftCalendarMonth,
} from "@/lib/khmer-lunar-calendar";

type AvailableCalendar = Extract<StudentAcademicCalendarView, { status: "available" }>;
type DisplayMode = "both" | "gregorian" | "lunar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MODES: { value: DisplayMode; label: string }[] = [
  { value: "gregorian", label: "Gregorian" },
  { value: "both", label: "Both" },
  { value: "lunar", label: "Khmer lunar" },
];

function initialCalendarDate(calendar: AvailableCalendar): string {
  const today = cambodiaTodayDateKey();
  const starts = calendar.periods.map((period) => period.teachingStart);
  const ends = calendar.periods.map((period) => period.breakEnd ?? period.examEnd ?? period.teachingEnd);
  if (!starts.length) return calendar.events[0]?.startDate ?? today;
  const first = [...starts].sort()[0];
  const last = [...ends].sort().at(-1) ?? first;
  return today >= first && today <= last ? today : first;
}

export function StudentKhmerLunarMonth({ calendar }: { calendar: AvailableCalendar }) {
  const [selectedDate, setSelectedDate] = useState(() => initialCalendarDate(calendar));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const key = initialCalendarDate(calendar);
    return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
  });
  const [displayMode, setDisplayMode] = useState<DisplayMode>("both");
  const today = cambodiaTodayDateKey();

  const cells = useMemo(
    () => buildKhmerLunarMonthCells(visibleMonth.year, visibleMonth.month),
    [visibleMonth.year, visibleMonth.month],
  );
  const selectedLunar = khmerLunarDisplay(selectedDate);
  const selectedItems = publishedItemsOnDate(calendar, selectedDate);
  const canGoBack = visibleMonth.year > 1900 || visibleMonth.month > 1;

  function moveMonth(offset: number) {
    const next = shiftCalendarMonth(visibleMonth.year, visibleMonth.month, offset);
    if (next.year < 1900) return;
    setVisibleMonth(next);
    setSelectedDate(
      String(next.year).padStart(4, "0") + "-" +
      String(next.month).padStart(2, "0") + "-01",
    );
  }

  function jumpToToday() {
    const key = cambodiaTodayDateKey();
    setSelectedDate(key);
    setVisibleMonth({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) });
  }

  return (
    <section
      aria-labelledby="student-khmer-calendar-heading"
      className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4 md:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="student-khmer-calendar-heading" className="text-lg font-semibold">
            Month calendar
          </h3>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Gregorian dates with Khmer lunar dates (ចន្ទគតិខ្មែរ).
          </p>
        </div>
        <div role="group" aria-label="Calendar date display" className="inline-flex self-start rounded-xl border border-border bg-muted/40 p-1">
          {MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              aria-pressed={displayMode === mode.value}
              onClick={() => setDisplayMode(mode.value)}
              className={
                "min-h-9 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 " +
                (displayMode === mode.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
              }
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <h4 className="text-base font-semibold sm:text-lg">
            {monthHeading(visibleMonth.year, visibleMonth.month)}
          </h4>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            disabled={!canGoBack}
            onClick={() => moveMonth(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border transition hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={jumpToToday}
            className="min-h-10 rounded-lg border border-border px-2 text-xs font-semibold transition hover:bg-muted sm:px-3"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => moveMonth(1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border transition hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5" aria-label="Monthly dates">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1 text-center text-[10px] font-semibold text-muted-foreground sm:text-xs">
            {weekday}
          </div>
        ))}
        {cells.map((cell) => {
          const selected = cell.dateKey === selectedDate;
          const isToday = cell.dateKey === today;
          const officialItems = publishedItemsOnDate(calendar, cell.dateKey);
          const significant = officialItems.some((item) => item.kind !== "teaching");
          const showLunar = displayMode !== "gregorian" && Boolean(cell.lunar.short);

          return (
            <button
              key={cell.dateKey}
              type="button"
              aria-pressed={selected}
              aria-current={isToday ? "date" : undefined}
              aria-label={
                formatGregorianCalendarDate(cell.dateKey) +
                (cell.lunar.full ? ", " + cell.lunar.full : "") +
                (significant ? ", official calendar event" : "")
              }
              onClick={() => {
                setSelectedDate(cell.dateKey);
                if (!cell.inMonth) {
                  setVisibleMonth({
                    year: Number(cell.dateKey.slice(0, 4)),
                    month: Number(cell.dateKey.slice(5, 7)),
                  });
                }
              }}
              className={
                "flex min-h-[4.5rem] min-w-0 flex-col items-center justify-start overflow-hidden rounded-lg border px-0.5 py-2 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-[5.5rem] sm:rounded-xl sm:px-2 " +
                (selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : isToday
                    ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                    : "border-border/60 hover:border-primary/30 hover:bg-muted/60") +
                (!cell.inMonth ? " opacity-45" : "")
              }
            >
              <span className={"text-sm font-semibold tabular-nums sm:text-base " + (isToday ? "text-primary" : "text-foreground")}>
                {cell.day}
              </span>
              {showLunar ? (
                <>
                  <span lang="km" className={"mt-1 w-full truncate text-[9px] leading-4 sm:text-xs " + (displayMode === "lunar" ? "font-semibold" : "text-muted-foreground")}>
                    {cell.lunar.short}
                  </span>
                  <span lang="km" className="hidden w-full truncate text-[11px] leading-4 text-muted-foreground md:block">
                    {cell.lunar.month}
                  </span>
                </>
              ) : null}
              {significant ? (
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 sm:p-4" aria-live="polite">
        <p className="text-sm font-semibold text-foreground">
          {formatGregorianCalendarDate(selectedDate)}
        </p>
        {displayMode !== "gregorian" ? (
          <p lang="km" className="mt-1 break-words text-sm font-medium text-foreground sm:text-base">
            {selectedLunar.full}
          </p>
        ) : null}
        <div className="mt-3 border-t border-border/70 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Published academic information
          </p>
          {selectedItems.length ? (
            <ul className="mt-2 space-y-1.5">
              {selectedItems.map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span>{item.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No additional published academic information for this date.
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Khmer lunar dates are calculated for reference only. Official semester dates,
        examinations, breaks and holidays come exclusively from the published DSE calendar.
      </p>
    </section>
  );
}
