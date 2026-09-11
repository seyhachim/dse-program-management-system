"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  SaveTeachingSessionDeliveryInput,
  TeachingSessionCoverage,
  TeachingSessionMonitorContextView,
} from "@dse-pms/shared-types";
import { ArrowLeft, CheckCircle2, Clock3, History, NotebookPen } from "lucide-react";
import { monitorDeliveryApi } from "@/lib/monitor-delivery";
import { PortalError, PortalLoading } from "../../portal-state";

const COVERAGE_OPTIONS: Array<{ value: TeachingSessionCoverage; label: string }> = [
  { value: "TAUGHT_AS_PLANNED", label: "Taught as planned" },
  { value: "PARTIALLY_COVERED", label: "Partially covered" },
  { value: "DIFFERENT_TOPIC", label: "Different topic taught" },
  { value: "NOT_COVERED", label: "Planned topic not covered" },
];

function initialInput(context: TeachingSessionMonitorContextView): SaveTeachingSessionDeliveryInput {
  const existing = context.delivery;
  if (existing) {
    return {
      lecturerArrivalStatus: context.lecturerArrival?.status ?? null,
      classOccurred: existing.classOccurred,
      actualLecturerId: existing.actualLecturer?.id ?? null,
      actualStartTime: existing.actualStartTime,
      actualEndTime: existing.actualEndTime,
      actualTopic: existing.actualTopic,
      learningSummary: existing.learningSummary,
      coverage: existing.coverage,
      note: existing.note,
    };
  }
  return {
    lecturerArrivalStatus: context.lecturerArrival?.status ?? null,
    classOccurred: true,
    actualLecturerId: context.eligibleLecturers[0]?.id ?? null,
    actualStartTime: context.occurrence.scheduledStartTime,
    actualEndTime: context.occurrence.scheduledEndTime,
    actualTopic: context.plannedWeek?.topic ?? "",
    learningSummary: "",
    coverage: "TAUGHT_AS_PLANNED",
    note: "",
  };
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
    const [sh, sm] = input.actualStartTime.split(":").map(Number);
    const [eh, em] = input.actualEndTime.split(":").map(Number);
    return Math.max(0, eh! * 60 + em! - (sh! * 60 + sm!));
  }, [input]);

  if (loading) return <PortalLoading />;
  if (error && (!context || !input)) return <PortalError message={error} />;
  if (!context || !input) return <PortalError message="Could not load class delivery" />;

  const setOccurred = (occurred: boolean) => {
    setNotice(null);
    setInput((current) => {
      if (!current) return current;
      if (!occurred) {
        return {
          ...current,
          classOccurred: false,
          actualLecturerId: null,
          actualStartTime: null,
          actualEndTime: null,
          learningSummary: "",
          coverage: "NOT_COVERED",
        };
      }
      return {
        ...current,
        classOccurred: true,
        actualLecturerId: current.actualLecturerId ?? context.eligibleLecturers[0]?.id ?? null,
        actualStartTime: current.actualStartTime ?? context.occurrence.scheduledStartTime,
        actualEndTime: current.actualEndTime ?? context.occurrence.scheduledEndTime,
        coverage: current.coverage === "NOT_COVERED" ? "TAUGHT_AS_PLANNED" : current.coverage,
      };
    });
  };

  const save = async () => {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const result = await monitorDeliveryApi.save(offeringId, meetingId, date, input);
      const refreshed = await monitorDeliveryApi.context(offeringId, meetingId, date);
      setContext(refreshed);
      setInput(initialInput(refreshed));
      setNotice(result.changed ? "Class record saved." : "No changes to save.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save class delivery");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium shadow-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to schedule
      </button>

      <section className="rounded-[1.75rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <NotebookPen className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {context.responsibility.role === "ClassMonitor" ? "Class Monitor" : "Sub-class Monitor"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Record class delivery</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {context.occurrence.date} · {context.occurrence.scheduledStartTime}–{context.occurrence.scheduledEndTime}
              {context.occurrence.scheduledRoom ? ` · ${context.occurrence.scheduledRoom}` : ""}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Record factual class evidence only. “Not yet confirmed” is not an official lecturer-absence or disciplinary finding.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Planned Weekly Plan</p>
        {context.plannedWeek ? (
          <div className="mt-3">
            <p className="text-sm font-semibold text-foreground">Week {context.plannedWeek.week}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{context.plannedWeek.topic || "No planned topic entered"}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              This is read-only source context from the exact Approved Course Specification. Recording delivery never changes the Weekly Plan.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No approved Weekly Plan row could be resolved for this teaching week. You can still record what actually happened.
          </p>
        )}
      </section>

      <section className="space-y-5 rounded-[1.75rem] border border-border bg-card p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-foreground">Lecturer arrival</p>
          <p className="mt-1 text-xs text-muted-foreground">Use only the factual state you can observe.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={input.lecturerArrivalStatus === "Present"}
              onClick={() =>
                setInput((current) => current ? { ...current, lecturerArrivalStatus: "Present" } : current)
              }
              className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
                input.lecturerArrivalStatus === "Present"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              }`}
            >
              Present
            </button>
            <button
              type="button"
              aria-pressed={input.lecturerArrivalStatus === "NotYet"}
              onClick={() =>
                setInput((current) => current ? { ...current, lecturerArrivalStatus: "NotYet" } : current)
              }
              className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
                input.lecturerArrivalStatus === "NotYet"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              }`}
            >
              Not yet confirmed
            </button>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-foreground">Did the class occur?</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={input.classOccurred}
              onClick={() => setOccurred(true)}
              className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
                input.classOccurred ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              aria-pressed={!input.classOccurred}
              onClick={() => setOccurred(false)}
              className={`min-h-11 rounded-xl border px-3 text-sm font-medium ${
                !input.classOccurred ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
              }`}
            >
              No
            </button>
          </div>
        </div>

        {input.classOccurred ? (
          <>
            <label className="block text-sm font-medium text-foreground">
              Actual lecturer
              <select
                value={input.actualLecturerId ?? ""}
                onChange={(event) =>
                  setInput((current) => current ? { ...current, actualLecturerId: event.target.value || null } : current)
                }
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="">Select lecturer</option>
                {context.eligibleLecturers.map((lecturer) => (
                  <option key={lecturer.id} value={lecturer.id}>{lecturer.name}</option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-foreground">
                Actual start
                <input
                  type="time"
                  value={input.actualStartTime ?? ""}
                  onChange={(event) => setInput((current) => current ? { ...current, actualStartTime: event.target.value || null } : current)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>
              <label className="block text-sm font-medium text-foreground">
                Actual end
                <input
                  type="time"
                  value={input.actualEndTime ?? ""}
                  onChange={(event) => setInput((current) => current ? { ...current, actualEndTime: event.target.value || null } : current)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </label>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {deliveredMinutes > 0 ? `${deliveredMinutes} minutes (${Math.round((deliveredMinutes / 60) * 100) / 100} contact hours)` : "Enter a valid end time after the start time"}
            </div>
          </>
        ) : null}

        <label className="block text-sm font-medium text-foreground">
          Class topic / title actually taught
          <textarea
            value={input.actualTopic}
            maxLength={1000}
            rows={3}
            onChange={(event) => setInput((current) => current ? { ...current, actualTopic: event.target.value } : current)}
            placeholder={input.classOccurred ? "Record the actual topic/content taught" : "Optional factual note about the class not being held"}
            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm"
          />
        </label>

        {input.classOccurred ? (
          <>
            <label className="block text-sm font-medium text-foreground">
              What we learned
              <textarea
                value={input.learningSummary}
                maxLength={1000}
                rows={4}
                onChange={(event) => setInput((current) => current ? { ...current, learningSummary: event.target.value } : current)}
                placeholder="Short student-safe summary of what the class learned"
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                This summary can later appear in students’ Week 1–16 Weekly Notes.
              </span>
            </label>

            <label className="block text-sm font-medium text-foreground">
              Planned-topic coverage
              <select
                value={input.coverage}
                onChange={(event) => setInput((current) => current ? { ...current, coverage: event.target.value as TeachingSessionCoverage } : current)}
                className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                {COVERAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <label className="block text-sm font-medium text-foreground">
          Private internal note
          <textarea
            value={input.note}
            maxLength={500}
            rows={3}
            onChange={(event) => setInput((current) => current ? { ...current, note: event.target.value } : current)}
            placeholder="Optional note for authorized staff review"
            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            This is structurally separate from “What we learned” and must never be student-visible.
          </span>
        </label>

        {error ? <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
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
          {saving ? "Saving…" : context.delivery ? "Save correction" : "Save class record"}
        </button>
      </section>

      {context.history.length > 0 ? (
        <section className="rounded-[1.75rem] border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">Delivery history</h3>
          </div>
          <div className="mt-3 space-y-2">
            {[...context.history].reverse().map((event) => (
              <div key={event.id} className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Revision {event.revision} · {event.actor.name}</p>
                <p className="mt-0.5">{new Date(event.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
