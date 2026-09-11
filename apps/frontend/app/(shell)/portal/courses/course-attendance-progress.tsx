import type {
  AcademicCalendarPeriodView,
  PortalCourseAchievementSummary,
  StudentAcademicCalendarView,
} from "@dse-pms/shared-types";
import { resolveStudentTeachingContext } from "@/lib/academic-calendar";

export type CourseAttendanceWeekState =
  | "present"
  | "late"
  | "absent"
  | "excused"
  | "pending"
  | "not-recorded"
  | "future";

export interface CourseAttendanceWeek {
  week: number;
  state: CourseAttendanceWeekState;
  current: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const STATE_PRIORITY: Record<
  Exclude<CourseAttendanceWeekState, "not-recorded" | "future">,
  number
> = {
  present: 1,
  excused: 2,
  late: 3,
  absent: 4,
  pending: 0,
};

const STATE_STYLE: Record<CourseAttendanceWeekState, string> = {
  present: "bg-emerald-500",
  late: "bg-amber-400",
  absent: "bg-rose-500",
  excused: "bg-sky-400",
  pending: "bg-violet-400/75",
  "not-recorded": "bg-muted-foreground/15",
  future: "bg-muted-foreground/10",
};

const STATE_LABEL: Record<CourseAttendanceWeekState, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
  pending: "Permission pending",
  "not-recorded": "No attendance recorded",
  future: "Future week",
};

function calendarDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function inclusiveDays(start: string, end: string): number {
  return Math.floor(
    (calendarDate(end).getTime() - calendarDate(start).getTime()) / DAY_MS,
  ) + 1;
}

function overlapDays(
  start: string,
  end: string,
  breakStart: string | null,
  breakEnd: string | null,
): number {
  if (!breakStart || !breakEnd) return 0;
  const overlapStart = breakStart > start ? breakStart : start;
  const overlapEnd = breakEnd < end ? breakEnd : end;
  return overlapStart <= overlapEnd ? inclusiveDays(overlapStart, overlapEnd) : 0;
}

export function teachingWeekForAttendanceDate(
  period: AcademicCalendarPeriodView,
  date: string,
): number | null {
  if (date < period.teachingStart || date > period.teachingEnd) return null;
  if (
    period.breakStart &&
    period.breakEnd &&
    date >= period.breakStart &&
    date <= period.breakEnd
  ) {
    return null;
  }

  const elapsed = inclusiveDays(period.teachingStart, date);
  const elapsedBreak = overlapDays(
    period.teachingStart,
    date,
    period.breakStart,
    period.breakEnd,
  );
  return Math.max(1, Math.ceil(Math.max(1, elapsed - elapsedBreak) / 7));
}

export function teachingWeekCountForAttendance(
  period: AcademicCalendarPeriodView,
): number {
  const totalDays = inclusiveDays(period.teachingStart, period.teachingEnd);
  const breakDays = overlapDays(
    period.teachingStart,
    period.teachingEnd,
    period.breakStart,
    period.breakEnd,
  );
  return Math.max(1, Math.ceil((totalDays - breakDays) / 7));
}

function semesterFromTerm(term: string): "First" | "Second" | null {
  const match = term.trim().toUpperCase().match(/(?:^|[-_])S([12])$/);
  return match?.[1] === "1" ? "First" : match?.[1] === "2" ? "Second" : null;
}

function academicYearFromTerm(term: string): string | null {
  return term.trim().match(/^(\d{4}-\d{4})(?:[-_]|$)/)?.[1] ?? null;
}

function periodForCourse(
  calendar: StudentAcademicCalendarView,
  term: string,
  sessions: PortalCourseAchievementSummary["attendance"]["sessions"],
): AcademicCalendarPeriodView | null {
  if (calendar.status !== "available") return null;

  const evidencePeriod = calendar.periods.find((period) =>
    sessions.some(
      (session) =>
        session.date >= period.teachingStart && session.date <= period.teachingEnd,
    ),
  );
  if (evidencePeriod) return evidencePeriod;

  const termAcademicYear = academicYearFromTerm(term);
  if (
    termAcademicYear &&
    termAcademicYear !== calendar.academicYear.label
  ) {
    return null;
  }

  const semester = semesterFromTerm(term);
  if (semester) {
    return calendar.periods.find((period) => period.semester === semester) ?? null;
  }

  return termAcademicYear === calendar.academicYear.label
    ? calendar.periods[0] ?? null
    : null;
}

function finalizedState(
  sessions: PortalCourseAchievementSummary["attendance"]["sessions"],
): Exclude<CourseAttendanceWeekState, "not-recorded" | "future" | "pending"> | null {
  let selected:
    | Exclude<CourseAttendanceWeekState, "not-recorded" | "future" | "pending">
    | null = null;

  for (const session of sessions) {
    const state =
      session.status === "Absent"
        ? "absent"
        : session.status === "Late"
          ? "late"
          : session.status === "Excused"
            ? "excused"
            : session.status === "Present"
              ? "present"
              : null;
    if (
      state &&
      (!selected || STATE_PRIORITY[state] > STATE_PRIORITY[selected])
    ) {
      selected = state;
    }
  }
  return selected;
}

export function buildCourseAttendanceWeeks(input: {
  summary: PortalCourseAchievementSummary;
  calendar: StudentAcademicCalendarView;
  term: string;
  now?: Date;
}): { weeks: CourseAttendanceWeek[]; currentWeek: number | null; totalWeeks: number } | null {
  const { summary, calendar, term } = input;
  const period = periodForCourse(calendar, term, summary.attendance.sessions);
  if (!period) return null;

  const totalWeeks = teachingWeekCountForAttendance(period);
  const context = resolveStudentTeachingContext(calendar, input.now ?? new Date());
  const currentWeek =
    context?.kind === "teaching" && context.semester === period.semester
      ? context.week
      : context?.kind === "break" && context.semester === period.semester
        ? Math.max(1, context.nextWeek - 1)
        : context?.kind === "complete"
          ? totalWeeks
          : null;
  const courseIsFuture =
    (context?.kind === "upcoming" && context.semester === period.semester) ||
    (context?.kind === "between" && context.nextSemester === period.semester);

  const sessionsByWeek = new Map<
    number,
    PortalCourseAchievementSummary["attendance"]["sessions"]
  >();
  for (const session of summary.attendance.sessions) {
    const week = teachingWeekForAttendanceDate(period, session.date);
    if (!week || week > totalWeeks) continue;
    const current = sessionsByWeek.get(week) ?? [];
    current.push(session);
    sessionsByWeek.set(week, current);
  }

  const weeks = Array.from({ length: totalWeeks }, (_, index) => {
    const week = index + 1;
    const sessions = sessionsByWeek.get(week) ?? [];
    const finalized = finalizedState(sessions);
    const pending = !finalized && sessions.some((session) => session.permissionPending);
    const state: CourseAttendanceWeekState = finalized
      ? finalized
      : pending
        ? "pending"
        : courseIsFuture || (currentWeek !== null && week > currentWeek)
          ? "future"
          : "not-recorded";
    return { week, state, current: currentWeek === week };
  });

  return { weeks, currentWeek, totalWeeks };
}

export function CourseAttendanceProgress({
  summary,
  calendar,
  term,
}: {
  summary: PortalCourseAchievementSummary | null;
  calendar: StudentAcademicCalendarView;
  term: string;
}) {
  if (!summary) return null;

  const progress = buildCourseAttendanceWeeks({ summary, calendar, term });
  const rate = summary.attendance.attendanceRate;

  return (
    <div className="mt-3 rounded-2xl bg-muted/35 px-3 py-2.5 ring-1 ring-border/50">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 text-xs font-medium text-muted-foreground">
          Attendance{" "}
          <span className="font-semibold text-foreground">
            {rate === null ? "Not recorded" : `${Math.round(rate)}%`}
          </span>
        </p>
        {progress ? (
          <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
            {progress.currentWeek
              ? `Week ${progress.currentWeek}/${progress.totalWeeks}`
              : `${progress.totalWeeks} weeks`}
          </span>
        ) : null}
      </div>

      {progress ? (
        <div
          className="mt-2 grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${progress.totalWeeks}, minmax(0, 1fr))`,
          }}
          aria-label="Teaching-week attendance progress"
        >
          {progress.weeks.map((item) => (
            <span
              key={item.week}
              className={`h-2.5 min-w-0 rounded-full ${STATE_STYLE[item.state]} ${
                item.current
                  ? "ring-2 ring-primary ring-offset-1 ring-offset-card"
                  : ""
              }`}
              title={`Week ${item.week}: ${STATE_LABEL[item.state]}`}
              aria-label={`Week ${item.week}: ${STATE_LABEL[item.state]}`}
            />
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Weekly progress appears when the published teaching calendar is available.
        </p>
      )}
    </div>
  );
}
