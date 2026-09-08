export interface ScheduleDateOption {
  date: Date;
  key: string;
  weekdayShort: string;
  dayOfMonth: string;
  weekdayLong: string;
}

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

export function buildScheduleDateOptions(
  anchor: Date,
  radius = 2,
): ScheduleDateOption[] {
  const options: ScheduleDateOption[] = [];

  for (let offset = -radius; offset <= radius; offset += 1) {
    const date = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() + offset,
    );
    options.push({
      date,
      key: toLocalDateKey(date),
      weekdayShort: date.toLocaleDateString("en-US", { weekday: "short" }),
      dayOfMonth: String(date.getDate()),
      weekdayLong: date.toLocaleDateString("en-US", { weekday: "long" }),
    });
  }

  return options;
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
