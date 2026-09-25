"use client";

import { useEffect, useMemo, useState } from "react";
import type { TeachingSessionMonitorContextView } from "@dse-pms/shared-types";
import { CheckCircle2, Clock3, Play, Square } from "lucide-react";
import { monitorDeliveryApi } from "@/lib/monitor-delivery";
import {
  phnomPenhTimeFromIso,
  teachingStartRecordingWindow,
  teachingTimingDurationMinutes,
} from "./monitor-teaching-time-utils";

export function MonitorTeachingTimeCard({
  context,
  offeringId,
  meetingId,
  date,
  onChanged,
}: {
  context: TeachingSessionMonitorContextView;
  offeringId: string;
  meetingId: string;
  date: string;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const timing = context.timing;

  const startWindow = useMemo(
    () =>
      teachingStartRecordingWindow(
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

  const duration = useMemo(
    () =>
      teachingTimingDurationMinutes(
        timing?.startedAt ?? null,
        timing?.endedAt ?? null,
      ),
    [timing?.endedAt, timing?.startedAt],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const markStarted = async () => {
    if (!startWindow.canRecord) return;
    try {
      setSaving("start");
      setError(null);
      await monitorDeliveryApi.markTeachingStarted(offeringId, meetingId, date);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record teaching start");
    } finally {
      setSaving(null);
    }
  };

  const markEnded = async () => {
    try {
      setSaving("end");
      setError(null);
      await monitorDeliveryApi.markTeachingEnded(offeringId, meetingId, date);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record teaching end");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Teaching time</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Capture the real start and end with server time.
          </p>
        </div>
        <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      {!timing?.startedAt ? (
        <div className="mt-3">
          {startWindow.status === "too-early" ? (
            <>
              <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                Start recording opens at{" "}
                <span className="font-semibold text-foreground">{startWindow.opensAtTime}</span>.
              </p>
              <button
                type="button"
                disabled
                className="mt-2 min-h-11 w-full rounded-xl bg-muted px-4 text-sm font-semibold text-muted-foreground"
              >
                Start teaching now
              </button>
            </>
          ) : startWindow.status === "closed" ? (
            <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
              The start-punch window is closed. Use the final actual-time fields below only as an
              audited correction or fallback.
            </p>
          ) : (
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void markStarted()}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {saving === "start" ? "Recording start…" : "Start teaching now"}
            </button>
          )}
        </div>
      ) : !timing.endedAt ? (
        <div className="mt-3">
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              Started {phnomPenhTimeFromIso(timing.startedAt)}
            </p>
          </div>
          <button
            type="button"
            disabled={saving !== null}
            onClick={() => void markEnded()}
            className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary bg-background px-4 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            {saving === "end" ? "Recording end…" : "End teaching now"}
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-lg bg-primary/10 px-3 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">
              {phnomPenhTimeFromIso(timing.startedAt)}–{phnomPenhTimeFromIso(timing.endedAt)}
            </p>
          </div>
          {duration ? (
            <p className="mt-1 pl-6 text-xs text-muted-foreground">
              {duration} min · {Math.round((duration / 60) * 100) / 100} contact hours
            </p>
          ) : null}
        </div>
      )}

      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        Captured timestamps are preserved. Final actual-time fields below remain editable only for
        an audited correction or missed-punch fallback.
      </p>

      {error ? (
        <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
