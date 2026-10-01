"use client";

import { useEffect, useMemo, useState } from "react";
import type { TeachingSessionMonitorContextView } from "@dse-pms/shared-types";
import { CheckCircle2, Clock3, Play, Square } from "lucide-react";
import { monitorDeliveryApi } from "@/lib/monitor-delivery";
import {
  phnomPenhTimeFromIso,
  teachingEndRecordingWindow,
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

  const endWindow = timing?.startedAt
    ? teachingEndRecordingWindow(timing.startedAt, now)
    : { canRecord: false, secondsRemaining: 0 };

  const duration = useMemo(
    () =>
      teachingTimingDurationMinutes(
        timing?.startedAt ?? null,
        timing?.endedAt ?? null,
      ),
    [timing?.endedAt, timing?.startedAt],
  );

  useEffect(() => {
    const intervalMs = timing?.startedAt && !timing.endedAt ? 1_000 : 30_000;
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [timing?.endedAt, timing?.startedAt]);

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
    if (!endWindow.canRecord) return;
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
          <p className="text-sm font-semibold text-foreground">Class time</p>
        </div>
        <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>

      {!timing?.startedAt ? (
        <div className="mt-3">
          {startWindow.status === "too-early" ? (
            <>
              <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                Available at{" "}
                <span className="font-semibold text-foreground">{startWindow.opensAtTime}</span>.
              </p>
              <button
                type="button"
                disabled
                className="mt-2 min-h-11 w-full rounded-xl bg-muted px-4 text-sm font-semibold text-muted-foreground"
              >
                Start class
              </button>
            </>
          ) : startWindow.status === "closed" ? (
            <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
              Start time not recorded. Add it in More details.
            </p>
          ) : (
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void markStarted()}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {saving === "start" ? "Saving…" : "Start class"}
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
            disabled={saving !== null || !endWindow.canRecord}
            onClick={() => void markEnded()}
            className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary bg-background px-4 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            {saving === "end"
              ? "Saving…"
              : endWindow.canRecord
                ? "End class"
                : `End available in ${endWindow.secondsRemaining}s`}
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
            <p className="mt-1 pl-6 text-xs text-muted-foreground">{duration} min</p>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
