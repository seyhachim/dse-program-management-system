"use client";

import { useEffect, useMemo, useState } from "react";
import type { TeachingSessionMonitorContextView } from "@dse-pms/shared-types";
import { CheckCircle2, Clock3 } from "lucide-react";
import { monitorDeliveryApi } from "@/lib/monitor-delivery";
import {
  lecturerArrivalPunctuality,
  lecturerArrivalRecordingWindow,
} from "./monitor-arrival-utils";

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
  const [now, setNow] = useState(() => new Date());
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
  const recordingWindow = useMemo(
    () =>
      lecturerArrivalRecordingWindow(
        context.occurrence.date,
        context.occurrence.scheduledStartTime,
        context.occurrence.scheduledEndTime,
        now,
      ),
    [
      context.occurrence.date,
      context.occurrence.scheduledEndTime,
      context.occurrence.scheduledStartTime,
      now,
    ],
  );
  const recordedWindow = useMemo(
    () =>
      arrival
        ? lecturerArrivalRecordingWindow(
            context.occurrence.date,
            context.occurrence.scheduledStartTime,
            context.occurrence.scheduledEndTime,
            new Date(arrival.recordedAt),
          )
        : null,
    [
      arrival,
      context.occurrence.date,
      context.occurrence.scheduledEndTime,
      context.occurrence.scheduledStartTime,
    ],
  );
  const recordedOutsideWindow = recordedWindow !== null && recordedWindow.status !== "open";

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const markArrived = async () => {
    if (!recordingWindow.canRecord) return;
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
    <section className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Step 1 · Arrival</p>
          <h3 className="mt-0.5 text-base font-semibold text-foreground">Lecturer arrival</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Scheduled {context.occurrence.scheduledStartTime}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clock3 className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      {arrival && punctuality ? (
        <>
          <div className={`mt-3 flex items-center gap-3 rounded-xl px-3 py-3 ${recordedOutsideWindow ? "bg-muted/45" : "bg-primary/10"}`}>
            {recordedOutsideWindow ? (
              <Clock3 className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Arrived {punctuality.time}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {recordedOutsideWindow ? "Recorded outside the current arrival window" : punctuality.label}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${recordedOutsideWindow ? "bg-background text-muted-foreground" : "bg-background/70 text-primary"}`}>
              {recordedOutsideWindow ? "Review" : "Recorded"}
            </span>
          </div>
          {recordedOutsideWindow ? (
            <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
              Historical evidence is preserved. Ask authorized staff to review it if the recorded time is incorrect.
            </p>
          ) : null}
        </>
      ) : recordingWindow.status === "too-early" ? (
        <div className="mt-3">
          <div className="rounded-xl bg-muted/45 px-3 py-3 text-sm text-muted-foreground">
            Arrival recording opens at <span className="font-semibold text-foreground">{recordingWindow.opensAtTime}</span>.
          </div>
          <button
            type="button"
            disabled
            className="mt-2 min-h-11 w-full rounded-xl bg-muted px-4 text-sm font-semibold text-muted-foreground"
          >
            Opens at {recordingWindow.opensAtTime}
          </button>
        </div>
      ) : recordingWindow.status === "closed" ? (
        <div className="mt-3 rounded-xl bg-muted/45 px-3 py-3">
          <p className="text-sm font-semibold text-foreground">Arrival window closed</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The scheduled class ended at {recordingWindow.closesAtTime}. Continue with the class record below.
          </p>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void markArrived()}
            className="min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Recording…" : "Lecturer arrived now"}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Server time is recorded automatically; the monitor does not classify late or absent.
          </p>
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
    </section>
  );
}
