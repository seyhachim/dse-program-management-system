"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  SaveTeachingSessionDeliveryInput,
  TeachingSessionCoverage,
  TeachingSessionMonitorContextView,
} from "@dse-pms/shared-types";
import { ArrowLeft, CheckCircle2, ChevronDown, Clock3, History } from "lucide-react";
import { monitorDeliveryApi } from "@/lib/monitor-delivery";
import { PortalError, PortalLoading } from "../../portal-state";
import { MonitorTeachingTimeCard } from "./monitor-teaching-time-card";
import { phnomPenhTimeFromIso } from "./monitor-teaching-time-utils";

const COVERAGE_OPTIONS: Array<{ value: TeachingSessionCoverage; label: string }> = [
  { value: "TAUGHT_AS_PLANNED", label: "Taught as planned" },
  { value: "PARTIALLY_COVERED", label: "Partially covered" },
  { value: "DIFFERENT_TOPIC", label: "Different topic taught" },
  { value: "NOT_COVERED", label: "Planned topic not covered" },
];

const TIMING_TOLERANCE_MINUTES = 10;

function initialInput(context: TeachingSessionMonitorContextView): SaveTeachingSessionDeliveryInput {
  const existing = context.delivery;
  if (existing) {
    return {
      lecturerArrivalStatus: null,
      classOccurred: existing.classOccurred,
      actualLecturerId: existing.actualLecturer?.id ?? existing.actualLecturers[0]?.id ?? null,
      actualLecturerIds: existing.actualLecturers.map((lecturer) => lecturer.id),
      actualStartTime: existing.actualStartTime,
      actualEndTime: existing.actualEndTime,
      actualTopic: existing.actualTopic,
      learningSummary: existing.learningSummary,
      coverage: existing.coverage,
      note: existing.note,
    };
  }

  const defaultLecturer =
    context.eligibleLecturers.length === 1 ? context.eligibleLecturers[0] : null;

  return {
    lecturerArrivalStatus: null,
    classOccurred: true,
    actualLecturerId: defaultLecturer?.id ?? null,
    actualLecturerIds: defaultLecturer ? [defaultLecturer.id] : [],
    actualStartTime: context.timing?.startedAt
      ? phnomPenhTimeFromIso(context.timing.startedAt)
      : null,
    actualEndTime: context.timing?.endedAt
      ? phnomPenhTimeFromIso(context.timing.endedAt)
      : null,
    actualTopic: "",
    learningSummary: "",
    coverage: "TAUGHT_AS_PLANNED",
    note: "",
  };
}

function formatSessionDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Phnom_Penh",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function minutesFromClock(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function deliveryTimingSummary(
  input: SaveTeachingSessionDeliveryInput,
  context: TeachingSessionMonitorContextView,
): string | null {
  if (!input.classOccurred || !input.actualStartTime || !input.actualEndTime) return null;

  const lateBy =
    minutesFromClock(input.actualStartTime) -
    minutesFromClock(context.occurrence.scheduledStartTime);
  const earlyBy =
    minutesFromClock(context.occurrence.scheduledEndTime) -
    minutesFromClock(input.actualEndTime);

  const startedLate = lateBy > TIMING_TOLERANCE_MINUTES;
  const endedEarly = earlyBy > TIMING_TOLERANCE_MINUTES;

  if (!startedLate && !endedEarly) return null;
  if (startedLate && endedEarly) {
    return `Started ${lateBy} min late · Ended ${earlyBy} min early`;
  }
  if (startedLate) return `Started ${lateBy} min late`;
  return `Ended ${earlyBy} min early`;
}

export function MonitorDeliveryForm() {
  const router = useRouter();
  const params = useSearchParams();
  const offeringId = params.get("offeringId") ?? "";
  const meetingId = params.get("meetingId") ?? "";
  const date = params.get("date") ?? "";
  const [context, setContext] = useState<TeachingSessionMonitorContextView | null>(null);
  const [input, setInput] = useState<SaveTeachingSessionDeliveryInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!offeringId || !meetingId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("This class-delivery link is incomplete or invalid.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const next = await monitorDeliveryApi.context(offeringId, meetingId, date);
      setContext(next);
      setInput(initialInput(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load class-delivery context");
    } finally {
      setLoading(false);
    }
  }, [date, meetingId, offeringId]);

  useEffect(() => {
    void load();
  }, [load]);

  const deliveredMinutes = useMemo(() => {
    if (!input?.classOccurred || !input.actualStartTime || !input.actualEndTime) return 0;
    return Math.max(
      0,
      minutesFromClock(input.actualEndTime) - minutesFromClock(input.actualStartTime),
    );
  }, [input]);

  if (loading) return <PortalLoading />;
  if (error && (!context || !input)) return <PortalError message={error} />;
  if (!context || !input) return <PortalError message="Could not load class delivery" />;

  const deliveryRecorded = Boolean(context.delivery);
  const timingSummary = deliveryTimingSummary(input, context);
  const selectedLecturerIds =
    input.actualLecturerIds?.length
      ? input.actualLecturerIds
      : input.actualLecturerId
        ? [input.actualLecturerId]
        : [];

  const refreshTiming = async () => {
    const refreshed = await monitorDeliveryApi.context(offeringId, meetingId, date);
    setContext(refreshed);
    setInput((current) => {
      if (!current || refreshed.delivery) return current;
      return {
        ...current,
        actualStartTime:
          current.actualStartTime ??
          (refreshed.timing?.startedAt
            ? phnomPenhTimeFromIso(refreshed.timing.startedAt)
            : null),
        actualEndTime:
          current.actualEndTime ??
          (refreshed.timing?.endedAt
            ? phnomPenhTimeFromIso(refreshed.timing.endedAt)
            : null),
      };
    });
  };

  const setOccurred = (occurred: boolean) => {
    setNotice(null);
    setError(null);
    setInput((current) => {
      if (!current) return current;
      if (!occurred) {
        return {
          ...current,
          classOccurred: false,
          actualLecturerId: null,
          actualLecturerIds: [],
          actualStartTime: null,
          actualEndTime: null,
          learningSummary: "",
          coverage: "NOT_COVERED",
        };
      }

      const defaultLecturer =
        current.actualLecturerIds?.length || current.actualLecturerId
          ? null
          : context.eligibleLecturers.length === 1
            ? context.eligibleLecturers[0]
            : null;

      return {
        ...current,
        classOccurred: true,
        actualLecturerId: current.actualLecturerId ?? defaultLecturer?.id ?? null,
        actualLecturerIds:
          current.actualLecturerIds?.length
            ? current.actualLecturerIds
            : defaultLecturer
              ? [defaultLecturer.id]
              : [],
        actualStartTime:
          current.actualStartTime ??
          (context.timing?.startedAt ? phnomPenhTimeFromIso(context.timing.startedAt) : null),
        actualEndTime:
          current.actualEndTime ??
          (context.timing?.endedAt ? phnomPenhTimeFromIso(context.timing.endedAt) : null),
        coverage: current.coverage === "NOT_COVERED" ? "TAUGHT_AS_PLANNED" : current.coverage,
      };
    });
  };

  const save = async () => {
    if (input.classOccurred) {
      if (selectedLecturerIds.length === 0) {
        setError("Select who actually taught this class.");
        return;
      }
      if (!input.actualStartTime || !input.actualEndTime) {
        setError("Record the teaching start and end time, or add a timing correction.");
        return;
      }
      if (!input.actualTopic.trim()) {
        setError("Topic taught is required.");
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const result = await monitorDeliveryApi.save(offeringId, meetingId, date, {
        ...input,
        actualTopic: input.actualTopic.trim(),
        lecturerArrivalStatus: null,
      });
      const refreshed = await monitorDeliveryApi.context(offeringId, meetingId, date);
      setContext(refreshed);
      setInput(initialInput(refreshed));
      setNotice(result.changed ? "Class record saved." : "No changes to save.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save class record");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 pb-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium shadow-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to schedule
      </button>

      <section className="rounded-[1.5rem] border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-snug text-foreground">
              {context.course.code} · {context.course.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Section {context.course.sectionCode} · {formatSessionDate(context.occurrence.date)} · {context.occurrence.scheduledStartTime}–{context.occurrence.scheduledEndTime}
              {context.occurrence.scheduledRoom ? ` · Room ${context.occurrence.scheduledRoom}` : ""}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              deliveryRecorded
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {deliveryRecorded ? "Recorded" : "Pending"}
          </span>
        </div>
      </section>

      <section className="space-y-4 rounded-[1.5rem] border border-border bg-card p-4 shadow-sm sm:p-5">
        <div>
          <p className="text-sm font-semibold text-foreground">Was this class held?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={input.classOccurred}
              onClick={() => setOccurred(true)}
              className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
                input.classOccurred
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              }`}
            >
              Held
            </button>
            <button
              type="button"
              aria-pressed={!input.classOccurred}
              onClick={() => setOccurred(false)}
              className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
                !input.classOccurred
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              }`}
            >
              Not held
            </button>
          </div>
        </div>

        {context.plannedWeek ? (
          <div className="rounded-xl bg-muted/35 px-3 py-2.5">
            <p className="text-xs text-muted-foreground">
              Planned topic · Week {context.plannedWeek.week}
            </p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {context.plannedWeek.topic || "No planned topic"}
            </p>
          </div>
        ) : null}

        {input.classOccurred ? (
          <>
            <MonitorTeachingTimeCard
              context={context}
              offeringId={offeringId}
              meetingId={meetingId}
              date={date}
              onChanged={refreshTiming}
            />

            {timingSummary ? (
              <div className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2.5 text-sm text-foreground">
                <Clock3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{timingSummary}</span>
              </div>
            ) : null}

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">Lecturer</legend>
              {context.eligibleLecturers.length === 1 ? (
                <div className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-muted/25 px-3 py-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="font-medium text-foreground">{context.eligibleLecturers[0]?.name}</span>
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {context.eligibleLecturers.map((lecturer) => {
                    const checked = selectedLecturerIds.includes(lecturer.id);
                    return (
                      <label
                        key={lecturer.id}
                        className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setInput((current) => {
                              if (!current) return current;
                              const currentIds =
                                current.actualLecturerIds ??
                                (current.actualLecturerId ? [current.actualLecturerId] : []);
                              const nextIds = event.target.checked
                                ? [...new Set([...currentIds, lecturer.id])]
                                : currentIds.filter((id) => id !== lecturer.id);
                              return {
                                ...current,
                                actualLecturerIds: nextIds,
                                actualLecturerId: nextIds[0] ?? null,
                              };
                            })
                          }
                        />
                        <span>{lecturer.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <label className="block text-sm font-semibold text-foreground">
              Topic taught <span className="text-destructive">*</span>
              <textarea
                required
                value={input.actualTopic}
                maxLength={1000}
                rows={2}
                onChange={(event) => {
                  setError(null);
                  setInput((current) =>
                    current ? { ...current, actualTopic: event.target.value } : current,
                  );
                }}
                placeholder="Topic or content taught"
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm"
              />
            </label>

            <label className="block text-sm font-medium text-foreground">
              Learning note <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              <textarea
                value={input.learningSummary}
                maxLength={1000}
                rows={2}
                onChange={(event) =>
                  setInput((current) =>
                    current ? { ...current, learningSummary: event.target.value } : current,
                  )
                }
                placeholder="What students learned"
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm"
              />
            </label>
          </>
        ) : (
          <label className="block text-sm font-medium text-foreground">
            Note <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            <textarea
              value={input.actualTopic}
              maxLength={1000}
              rows={2}
              onChange={(event) =>
                setInput((current) =>
                  current ? { ...current, actualTopic: event.target.value } : current,
                )
              }
              placeholder="Cancelled, moved, or other note"
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm"
            />
          </label>
        )}

        <details className="group rounded-xl border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-medium text-foreground">
            More details
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-4 border-t border-border px-3 py-3">
            {input.classOccurred ? (
              <>
                <div>
                  <p className="text-sm font-medium text-foreground">Correct time</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <label className="block text-xs text-muted-foreground">
                      Start
                      <input
                        type="time"
                        value={input.actualStartTime ?? ""}
                        onChange={(event) =>
                          setInput((current) =>
                            current
                              ? { ...current, actualStartTime: event.target.value || null }
                              : current,
                          )
                        }
                        className="mt-1 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground"
                      />
                    </label>
                    <label className="block text-xs text-muted-foreground">
                      End
                      <input
                        type="time"
                        value={input.actualEndTime ?? ""}
                        onChange={(event) =>
                          setInput((current) =>
                            current
                              ? { ...current, actualEndTime: event.target.value || null }
                              : current,
                          )
                        }
                        className="mt-1 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground"
                      />
                    </label>
                  </div>
                  {deliveredMinutes > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">{deliveredMinutes} min</p>
                  ) : null}
                </div>

                <label className="block text-sm font-medium text-foreground">
                  Coverage
                  <select
                    value={input.coverage}
                    onChange={(event) =>
                      setInput((current) =>
                        current
                          ? {
                              ...current,
                              coverage: event.target.value as TeachingSessionCoverage,
                            }
                          : current,
                      )
                    }
                    className="mt-2 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                  >
                    {COVERAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            <label className="block text-sm font-medium text-foreground">
              Private note
              <textarea
                value={input.note}
                maxLength={500}
                rows={2}
                onChange={(event) =>
                  setInput((current) => (current ? { ...current, note: event.target.value } : current))
                }
                placeholder="Staff only"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-3 text-sm"
              />
            </label>
          </div>
        </details>

        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {notice}
          </p>
        ) : null}

        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </section>

      {context.history.length > 0 ? (
        <details className="group rounded-[1.25rem] border border-border bg-card shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">History</span>
              <span className="text-xs text-muted-foreground">{context.history.length}</span>
            </div>
            <ChevronDown
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-2 border-t border-border px-4 py-3">
            {[...context.history].reverse().map((event) => (
              <div
                key={event.id}
                className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
              >
                <p className="font-medium text-foreground">
                  Revision {event.revision} · {event.actor.name}
                </p>
                <p className="mt-0.5">{new Date(event.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
