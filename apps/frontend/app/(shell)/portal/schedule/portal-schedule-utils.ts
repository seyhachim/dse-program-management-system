export interface ScheduleDateOption {
  date: Date;
  key: string;
  weekdayShort: string;
  dayOfMonth: string;
  weekdayLong: string;
}

const TEACHING_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function normalizeTeachingDate(date: Date): Date {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (normalized.getDay() === 0) normalized.setDate(normalized.getDate() + 1);
  return normalized;
}

export function teachingWeekStart(anchor: Date): Date {
  const normalized = normalizeTeachingDate(anchor);
  const day = normalized.getDay();
  const daysSinceMonday = day - 1;
  return new Date(
    normalized.getFullYear(),
    normalized.getMonth(),
    normalized.getDate() - daysSinceMonday,
  );
}

export function buildTeachingWeekDateOptions(anchor: Date): ScheduleDateOption[] {
  const monday = teachingWeekStart(anchor);

  return TEACHING_WEEKDAYS.map((weekdayLong, offset) => {
    const date = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + offset,
    );
    return {
      date,
      key: toLocalDateKey(date),
      weekdayShort: weekdayLong.slice(0, 3),
      dayOfMonth: String(date.getDate()),
      weekdayLong,
    };
  });
}

export function formatTeachingWeekRange(options: ScheduleDateOption[]): string | null {
  const first = options[0]?.date;
  const last = options.at(-1)?.date;
  if (!first || !last) return null;

  const firstMonth = first.toLocaleDateString("en-US", { month: "short" });
  const lastMonth = last.toLocaleDateString("en-US", { month: "short" });
  return firstMonth === lastMonth
    ? `${first.getDate()}–${last.getDate()} ${lastMonth}`
    : `${first.getDate()} ${firstMonth}–${last.getDate()} ${lastMonth}`;
}

export function isSameLocalDate(left: Date, right: Date): boolean {
  return toLocalDateKey(left) === toLocalDateKey(right);
}

function parseTimeMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isMeetingInProgress(
  selectedDate: Date,
  now: Date,
  startTime: string,
  endTime: string,
): boolean {
  if (!isSameLocalDate(selectedDate, now)) return false;

  const start = parseTimeMinutes(startTime);
  const end = parseTimeMinutes(endTime);
  if (start === null || end === null) return false;

  const current = now.getHours() * 60 + now.getMinutes();
  if (end < start) {
    return current >= start || current < end;
  }
  return current >= start && current < end;
}

export function formatMeetingTime(value: string): string {
  const minutes = parseTimeMinutes(value);
  if (minutes === null) return value;

  const hours24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${pad(minute)} ${suffix}`;
}
