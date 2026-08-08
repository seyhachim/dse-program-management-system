"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  FileCheck2,
  Send,
  UserRound,
} from "lucide-react";
import {
  COMPLETABLE_SPEC_SECTIONS,
  type CourseSpecReviewStatus,
  type SpecSectionStatus,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import type { CourseView } from "@/lib/courses";

const STATUS_META: Record<
  CourseSpecReviewStatus,
  { label: string; description: string }
> = {
  draft: { label: "Draft", description: "Work in progress" },
  submitted: {
    label: "Submitted",
    description: "Waiting for Head of Program review",
  },
  underReview: {
    label: "Under Review",
    description: "In review by Head of Program",
  },
  changesRequested: { label: "Changes Requested", description: "Action required" },
  resubmitted: { label: "Resubmitted", description: "Pending review" },
  approved: { label: "Approved", description: "Final approval" },
};

const FLOW: CourseSpecReviewStatus[] = [
  "draft",
  "submitted",
  "underReview",
  "changesRequested",
  "resubmitted",
  "approved",
];

export function ReviewSubmitSection({
  course,
  status,
  review,
  onSubmit,
  onPreview,
  onGoToSection,
  saving,
}: {
  course: CourseView;
  status: Record<string, SpecSectionStatus>;
  review: {
    status: CourseSpecReviewStatus;
    submissionVersion: number;
    submittedAt: string | null;
    submittedById: string | null;
    submissionNote: string;
  };
  onSubmit: (note: string) => Promise<boolean>;
  onPreview: () => void;
  onGoToSection: (id: (typeof COMPLETABLE_SPEC_SECTIONS)[number]["id"]) => void;
  saving: boolean;
}) {
  const [note, setNote] = useState(review.submissionNote);
  const [submitting, setSubmitting] = useState(false);
  const completed = useMemo(
    () => COMPLETABLE_SPEC_SECTIONS.filter((s) => status[s.id] === "complete"),
    [status],
  );
  const incomplete = useMemo(
    () => COMPLETABLE_SPEC_SECTIONS.filter((s) => status[s.id] !== "complete"),
    [status],
  );
  const ready = incomplete.length === 0;
  const canSubmit =
    ready &&
    (review.status === "draft" || review.status === "changesRequested") &&
    !saving &&
    !submitting;
  const currentIndex = FLOW.indexOf(review.status);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(note);
    } finally {
      setSubmitting(false);
    }
  };

  const statusMessage =
    review.status === "draft"
      ? ready
        ? "Your course specification is ready. Review the document, then submit it to the Head of Program."
        : "Complete all required sections before submitting."
      : STATUS_META[review.status].description + ".";

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Review & Submit</h2>
          <p className="text-sm text-muted-foreground">
            Prepare and submit your course specification for review by the Head of Program.
          </p>
        </div>
        <Button variant="outline" onClick={onPreview}>
          <Eye className="mr-2 h-4 w-4" />
          Preview Document
        </Button>
      </div>

      {/* Compact horizontal workflow */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Submission Status</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {STATUS_META[review.status].label}
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            Step {currentIndex + 1} of {FLOW.length}
          </span>
        </div>

        <div className="mt-5 overflow-x-auto pb-1">
          <div className="flex min-w-[780px]">
            {FLOW.map((item, index) => {
              const active = item === review.status;
              const passed = index < currentIndex;
              const nextPassed = index + 1 < currentIndex;

              return (
                <div key={item} className="relative min-w-0 flex-1 px-2 first:pl-0 last:pr-0">
                  {index < FLOW.length - 1 ? (
                    <div
                      className={`absolute left-[calc(50%+18px)] right-[-50%] top-[18px] h-px ${
                        nextPassed || passed ? "bg-emerald-500" : "bg-border"
                      }`}
                    />
                  ) : null}

                  <div className="relative flex flex-col items-center text-center">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 bg-card text-xs font-semibold ${
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : passed
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {passed ? "✓" : index + 1}
                    </span>
                    <p
                      className={`mt-2 whitespace-nowrap text-[11px] font-semibold ${
                        active ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {STATUS_META[item].label}
                    </p>
                    <p className="mt-0.5 max-w-[130px] text-[9px] leading-3 text-muted-foreground">
                      {STATUS_META[item].description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className={`mt-4 rounded-lg border px-3 py-2.5 text-xs ${
            ready && review.status === "draft"
              ? "border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200"
              : "border-blue-200/70 bg-blue-50/60 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200"
          }`}
        >
          {statusMessage}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Course Information</p>
              <h3 className="mt-4 text-2xl font-bold text-foreground">{course.code}</h3>
              <p className="text-base font-medium text-foreground">{course.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{course.credits ?? "—"} Credits</p>
            </div>
            <FileCheck2 className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-5 space-y-2 border-t border-border pt-4 text-xs">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Lecturer</span>
              <span className="font-medium text-foreground">{course.lecturer?.name ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Version</span>
              <span className="font-medium text-foreground">v{review.submissionVersion || 1}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Last submitted</span>
              <span className="font-medium text-foreground">
                {review.submittedAt ? new Date(review.submittedAt).toLocaleString() : "Not submitted"}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Course Specification Readiness</p>
              <p className="mt-1 text-xs text-muted-foreground">Required sections only</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {completed.length}/{COMPLETABLE_SPEC_SECTIONS.length} Complete
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {COMPLETABLE_SPEC_SECTIONS.map((section) => {
              const done = status[section.id] === "complete";
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => !done && onGoToSection(section.id)}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/50"
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <span className="min-w-0 flex-1 text-xs text-foreground">{section.title}</span>
                  <span className={`text-[11px] ${done ? "text-emerald-600" : "text-amber-600"}`}>
                    {done ? "Complete" : "Incomplete"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Next Steps</p>
            <span className="text-xs font-medium text-muted-foreground">
              {incomplete.length ? `${incomplete.length} required` : "Ready"}
            </span>
          </div>
          {incomplete.length ? (
            <div className="mt-4 space-y-2">
              {incomplete.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onGoToSection(item.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-left text-xs text-amber-900 hover:bg-amber-50"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Complete {item.title}</span>
                  <span>→</span>
                </button>
              ))}
              {incomplete.length > 3 ? (
                <p className="text-xs text-muted-foreground">+ {incomplete.length - 3} more required section(s)</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-800">
              <CheckCircle2 className="mb-2 h-5 w-5" />
              All required sections are complete. Review the document before submitting.
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Document Preview</p>
          </div>
          <div className="mt-4 flex h-52 items-center justify-center rounded-lg border border-border bg-muted/20">
            <div className="w-40 rounded-md border border-border bg-background p-4 shadow-sm">
              <div className="h-2 w-20 rounded bg-foreground/20" />
              <div className="mt-3 space-y-2">
                <div className="h-1.5 w-full rounded bg-muted" />
                <div className="h-1.5 w-5/6 rounded bg-muted" />
                <div className="h-1.5 w-full rounded bg-muted" />
                <div className="h-8 w-full rounded bg-muted/70" />
              </div>
            </div>
          </div>
          <Button variant="outline" className="mt-3 w-full" onClick={onPreview}>
            <Eye className="mr-2 h-4 w-4" />
            View Full Document
          </Button>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Submission</p>
          </div>
          <div className="mt-4 rounded-lg bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <UserRound className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {ready ? "Ready to submit your course specification?" : "Complete your course specification first"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ready
                    ? "The current saved version will be sent to the Head of Program for review."
                    : "Submission is disabled until all required sections are complete."}
                </p>
              </div>
            </div>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-foreground">
                Submission note <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a short note for the reviewer…"
                className="mt-1.5 min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                disabled={!canSubmit}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {ready
                ? "All required sections are complete."
                : `${incomplete.length} required section${incomplete.length === 1 ? " is" : "s are"} incomplete.`}
            </p>
            <Button
              onClick={submit}
              disabled={!canSubmit}
              title={!ready ? "Complete all required sections first" : undefined}
            >
              <Send className="mr-2 h-4 w-4" />
              {submitting
                ? "Submitting…"
                : review.status === "changesRequested"
                  ? "Resubmit for Review"
                  : "Submit for Review"}
            </Button>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Review Comments</p>
        </div>
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm font-medium text-foreground">
            {review.status === "draft" ? "No review comments yet." : "Review comments will appear here when the review workflow is connected."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {review.status === "draft"
              ? "Comments from the Head of Program will appear here after submission."
              : "The current phase stores submission status; reviewer comments are not yet part of this workflow."}
          </p>
        </div>
      </section>

      <div className="sticky bottom-3 z-10 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">Before you submit</p>
            <p className="text-[11px] text-muted-foreground">
              Review the document and make sure all required sections are complete.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {completed.length}/{COMPLETABLE_SPEC_SECTIONS.length} required complete
            </span>
            <Button variant="outline" onClick={onPreview}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              <Send className="mr-2 h-4 w-4" />
              {review.status === "changesRequested" ? "Resubmit" : "Submit for Review"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
