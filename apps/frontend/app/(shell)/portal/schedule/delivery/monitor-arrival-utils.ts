export function lecturerArrivalPunctuality(
  date: string,
  scheduledStartTime: string,
  recordedAt: string,
): { time: string; deltaMinutes: number; label: string } {
  const scheduled = new Date(`${date}T${scheduledStartTime}:00+07:00`);
  const arrival = new Date(recordedAt);
  const deltaMinutes = Math.round((arrival.getTime() - scheduled.getTime()) / 60_000);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(arrival);

  const label =
    deltaMinutes > 0
      ? `${deltaMinutes} min after scheduled start`
      : deltaMinutes < 0
        ? `${Math.abs(deltaMinutes)} min before scheduled start`
        : "At scheduled start";

  return { time, deltaMinutes, label };
}
