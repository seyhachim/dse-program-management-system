import { TEACHING_START_EARLY_WINDOW_MINUTES } from "@dse-pms/shared-types";

function phnomPenhInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+07:00`);
}

export function phnomPenhTimeFromIso(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export type TeachingStartRecordingWindow = {
  status: "too-early" | "open" | "closed";
  canRecord: boolean;
  opensAtTime: string;
};

export function teachingStartRecordingWindow(
  date: string,
  scheduledStartTime: string,
  scheduledEndTime: string,
  now = new Date(),
): TeachingStartRecordingWindow {
  const scheduledStart = phnomPenhInstant(date, scheduledStartTime);
  const scheduledEnd = phnomPenhInstant(date, scheduledEndTime);
  const opensAt = new Date(
    scheduledStart.getTime() - TEACHING_START_EARLY_WINDOW_MINUTES * 60_000,
  );
  const status = now < opensAt ? "too-early" : now > scheduledEnd ? "closed" : "open";
  return {
    status,
    canRecord: status === "open",
    opensAtTime: phnomPenhTimeFromIso(opensAt.toISOString()),
  };
}

export function teachingTimingDurationMinutes(
  startedAt: string | null,
  endedAt: string | null,
): number | null {
  if (!startedAt || !endedAt) return null;
  const minutes = Math.round(
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000,
  );
  return minutes > 0 ? minutes : null;
}
