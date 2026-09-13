import { LECTURER_ARRIVAL_EARLY_WINDOW_MINUTES } from "@dse-pms/shared-types";

function phnomPenhInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+07:00`);
}

function phnomPenhTime(value: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export type LecturerArrivalRecordingWindow = {
  status: "too-early" | "open" | "closed";
  canRecord: boolean;
  opensAtTime: string;
  closesAtTime: string;
};

export function lecturerArrivalRecordingWindow(
  date: string,
  scheduledStartTime: string,
  scheduledEndTime: string,
  now = new Date(),
): LecturerArrivalRecordingWindow {
  const scheduledStart = phnomPenhInstant(date, scheduledStartTime);
  const scheduledEnd = phnomPenhInstant(date, scheduledEndTime);
  const opensAt = new Date(
    scheduledStart.getTime() - LECTURER_ARRIVAL_EARLY_WINDOW_MINUTES * 60_000,
  );

  const status = now < opensAt ? "too-early" : now > scheduledEnd ? "closed" : "open";
  return {
    status,
    canRecord: status === "open",
    opensAtTime: phnomPenhTime(opensAt),
    closesAtTime: phnomPenhTime(scheduledEnd),
  };
}

export function lecturerArrivalPunctuality(
  date: string,
  scheduledStartTime: string,
  recordedAt: string,
): { time: string; deltaMinutes: number; label: string } {
  const scheduled = phnomPenhInstant(date, scheduledStartTime);
  const arrival = new Date(recordedAt);
  const deltaMinutes = Math.round((arrival.getTime() - scheduled.getTime()) / 60_000);
  const time = phnomPenhTime(arrival);

  const label =
    deltaMinutes > 0
      ? `${deltaMinutes} min after scheduled start`
      : deltaMinutes < 0
        ? `${Math.abs(deltaMinutes)} min before scheduled start`
        : "At scheduled start";

  return { time, deltaMinutes, label };
}
