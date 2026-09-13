"use client";

import { useMemo, useState } from "react";
import type { TeachingSessionMonitorContextView } from "@dse-pms/shared-types";
import { CheckCircle2, Clock3 } from "lucide-react";
import { monitorDeliveryApi } from "@/lib/monitor-delivery";

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

export function MonitorArrivalCard({
  context,
  offeringId,
  meetingId,
  date,
  onRecorded,
}: {
  context: TeachingSessionMonitorContextView;
  offeringId: string;
  meetingId: string;
  date: string;
  onRecorded: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const arrival = context.lecturerArrival?.status === "Present" ? context.lecturerArrival : null;
  const punctuality = useMemo(
    () =>
      arrival
        ? lecturerArrivalPunctuality(
            context.occurrence.date,
            context.occurrence.scheduledStartTime,
            arrival.recordedAt,
          )
        : null,
    [arrival, context.occurrence.date, context.occurrence.scheduledStartTime],
  );

  const markArrived = async () => {
    try {
      setSaving(true);
      setError(null);
      await monitorDeliveryApi.markArrived(offeringId, meetingId, date);
      await onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record lecturer arrival");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-[1.75rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Lecturer punctuality</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">Lecturer arrival</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Scheduled start · {context.occurrence.scheduledStartTime}
          </p>
        </div>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clock3 className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>

      {arrival && punctuality ? (
        <div className="mt-4 rounded-2xl bg-primary/10 p-4">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            <p className="text-sm font-semibold">Arrival recorded</p>
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {punctuality.time}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{punctuality.label}</p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            PMS uses the server timestamp. This factual arrival evidence is separate from the actual teaching start time below.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="rounded-2xl bg-muted/45 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Not arrived yet</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Tap only when you can observe that the lecturer has arrived. PMS records the time automatically; you do not decide whether it is late.
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void markArrived()}
            className="mt-3 min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Recording arrival…" : "Lecturer arrived now"}
          </button>
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        No student-authored “Late” or “Absent” finding is created here. Programme policy can interpret the timestamp separately.
      </p>
    </section>
  );
}
