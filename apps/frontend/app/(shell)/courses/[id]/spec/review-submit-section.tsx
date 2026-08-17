"use client";

import Link from "next/link";
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

const EDITABLE_REVIEW_STATUSES: CourseSpecReviewStatus[] = [
  "draft",
  "changesRequested",
];

const isEditableReviewStatus = (status: CourseSpecReviewStatus) =>
  EDITABLE_REVIEW_STATUSES.includes(status);

type ReadinessItem = {
  id: "courseInfo" | "clos" | "teachingLearning" | "assessmentPlan" | "slt";
  title: string;
  complete: boolean;
};

type ReadinessSectionId = ReadinessItem["id"];

export function ReviewSubmitSection({
  course,
  status,
  review,
  cloReady,
  teachingLearningReady,
  onSubmit,
  onPreview,
  onGoToSection,
  saving,
  canReview,
  onRequestChanges,
  onApprove,
}: {
  course: CourseView;
  status: Record<string, SpecSectionStatus>;
  review: {
    status: CourseSpecReviewStatus;
    submissionVersion: number;
    submittedAt: string | null;
    submittedById: string | null;
    submissionNote: string;
    actions: {
      id: string;
      submissionVersion: number;
      action: "submitted" | "resubmitted" | "changesRequested" | "approved";
      actorId: string;
      note: string;
      createdAt: string;
    }[];
  };
  cloReady: boolean;
  teachingLearningReady: boolean;
  onSubmit: (note: string) => Promise<boolean>;
  onPreview: () => void;
  onGoToSection: (id: ReadinessSectionId) => void;
  saving: boolean;
  canReview: boolean;
  onRequestChanges: (note: string) => Promise<boolean>;
  onApprove: (note: string) => Promise<boolean>;
}) {
  const [note, setNote] = useState(review.submissionNote);
  const [reviewNote, setReviewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const readinessItems = useMemo<ReadinessItem[]>(
    () => [
      {
        id: "courseInfo",
        title: "Course Information",
        complete: status.courseInfo === "complete",
      },
      {
        id: "clos",
        title: "Course Learning Outcomes",
        complete: cloReady,
      },
      {
        id: "teachingLearning",
        title: "Teaching & Learning",
        complete: teachingLearningReady,
      },
      {
        id: "assessmentPlan",
        title: "Assessment",
        complete: status.assessmentPlan === "complete",
      },
      {
        id: "slt",
        title: "Weekly Plan",
        complete: status.slt === "complete",
      },
    ],
    [status, cloReady, teachingLearningReady],
  );
  const completed = readinessItems.filter((item) => item.complete);
  const incomplete = readinessItems.filter((item) => !item.complete);
  const ready = incomplete.length === 0;
  const canSubmit =
    ready &&
    (review.status === "draft" || review.status === "changesRequested") &&
    !saving &&
    !submitting;
  const currentIndex = FLOW.indexOf(review.status);
  const editingEnabled = isEditableReviewStatus(review.status);
  const waitingForReview =
    review.status === "submitted" ||
    review.status === "underReview" ||
    review.status === "resubmitted";

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(note);
    } finally {
      setSubmitting(false);
    }
  };

  const statusMessage = (() => {
    switch (review.status) {
      case "draft":
        return ready
          ? "Your course specification is ready. Review the document, then submit it to the Head of Program."
          : "Complete all required sections before submitting.";
      case "submitted":
        return "Your course specification has been submitted and is waiting for the Head of Program review.";
      case "underReview":
        return "Your course specification is currently under review. Editing is locked until the review is completed.";
      case "changesRequested":
        return "Changes have been requested. Continue editing the course specification, then resubmit it for review.";
      case "resubmitted":
        return "Your revised course specification has been resubmitted and is waiting for review.";
      case "approved":
        return "Your course specification has been approved. Editing is locked for the approved version.";
    }
  })();

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Review & Submit</h2>
          <p className="text-sm text-muted-foreground">
            Prepare and submit your course specification for review by the Head of Program.
          </p>
        </div>
        <div className="flex gap-2">
          {canReview && review.status === "approved" ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/courses/${course.id}/spec/revision`} />}
            >
              Create Revision
            </Button>
          ) : null}
          <Button variant="outline" onClick={onPreview}>
            <Eye className="mr-2 h-4 w-4" />
            Preview Document
          </Button>
        </div>
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
              {completed.length}/{readinessItems.length} Complete
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {readinessItems.map((section) => {
              const done = section.complete;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => editingEnabled && !done && onGoToSection(section.id)}
                  disabled={!editingEnabled || done}
                  className={`flex w-full items-center gap-2 rounded-md px-1 py-1 text-left ${
                    editingEnabled && !done ? "hover:bg-muted/50" : "cursor-default"
                  }`}
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
              {review.status === "draft"
                ? incomplete.length
                  ? `${incomplete.length} required`
                  : "Ready"
                : review.status === "changesRequested"
                  ? "Action required"
                  : review.status === "approved"
                    ? "Complete"
                    : "Waiting"}
            </span>
          </div>

          {review.status === "draft" && incomplete.length ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-muted-foreground">
                Complete the items below before you can submit this course specification.
              </p>
              {incomplete.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onGoToSection(item.id)}
                  className="flex w-full items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-left text-xs text-amber-900 transition-colors hover:bg-amber-50"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Complete {item.title}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
              {incomplete.length > 3 ? (
                <p className="text-xs text-muted-foreground">+ {incomplete.length - 3} more required section(s)</p>
              ) : null}
            </div>
          ) : review.status === "draft" ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-800">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">All required sections are complete.</p>
                  <p className="mt-1 text-emerald-700">Review the generated document before submitting.</p>
                </div>
              </div>
            </div>
          ) : review.status === "changesRequested" ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
              <p className="font-semibold">Changes requested.</p>
              <p className="mt-1">Review the comments and update the course specification before resubmitting.</p>
            </div>
          ) : review.status === "approved" ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-800">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Course specification approved.</p>
                  <p className="mt-1 text-emerald-700">The approved version is locked for editing.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-blue-200/70 bg-blue-50/60 p-4 text-xs text-blue-800">
              <p className="font-semibold">No action required from you right now.</p>
              <p className="mt-1">The course specification is locked while it is in the review workflow.</p>
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
                {review.status === "approved" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : waitingForReview ? (
                  <Clock3 className="h-4 w-4 text-primary" />
                ) : (
                  <UserRound className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {review.status === "draft"
                    ? ready
                      ? "Ready to submit your course specification?"
                      : "Complete your course specification first"
                    : review.status === "changesRequested"
                      ? "Changes requested — continue editing"
                      : STATUS_META[review.status].label}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {review.status === "draft"
                    ? ready
                      ? "The current saved version will be sent to the Head of Program for review."
                      : "Submission is disabled until all required sections are complete."
                    : review.status === "changesRequested"
                      ? "Review the requested changes, update the course specification, and resubmit when ready."
                      : statusMessage}
                </p>
              </div>
            </div>

            {editingEnabled ? (
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
            ) : null}
          </div>

          {review.submittedAt ? (
            <div className="mt-4 grid gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-xs sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Submitted</p>
                <p className="mt-0.5 font-medium text-foreground">
                  {new Date(review.submittedAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Version</p>
                <p className="mt-0.5 font-medium text-foreground">v{review.submissionVersion || 1}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="mt-0.5 font-medium text-foreground">{STATUS_META[review.status].label}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="flex items-center gap-2">
              {review.status === "draft" && !ready ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              ) : review.status === "approved" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              )}
              <p className="text-xs font-medium text-foreground">
                {review.status === "draft"
                  ? ready
                    ? "Ready to submit. Use the action bar below when you are ready."
                    : `${incomplete.length} required section${incomplete.length === 1 ? " is" : "s are"} incomplete.`
                  : review.status === "changesRequested"
                    ? "You can edit the course specification and resubmit after making the requested changes."
                    : review.status === "approved"
                      ? "This approved version is locked for editing."
                      : "Editing and submission are locked while the course specification is in the review workflow."}
              </p>
            </div>
          </div>
        </section>
      </div>

      {canReview && ["submitted", "resubmitted", "underReview"].includes(review.status) ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Head of Program Review</p>
              <p className="text-xs text-muted-foreground">Review the submitted course specification before approving it for use.</p>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-medium text-foreground">Review note</span>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Add a comment for the lecturer. Required when requesting changes."
              className="mt-1.5 min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              disabled={reviewing}
            />
          </label>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                setReviewing(true);
                const ok = await onRequestChanges(reviewNote);
                if (ok) setReviewNote("");
                setReviewing(false);
              }}
              disabled={reviewing || !reviewNote.trim()}
            >
              {reviewing ? "Saving…" : "Request Changes"}
            </Button>
            <Button
              onClick={async () => {
                setReviewing(true);
                const ok = await onApprove(reviewNote);
                if (ok) setReviewNote("");
                setReviewing(false);
              }}
              disabled={reviewing}
            >
              {reviewing ? "Approving…" : "Approve"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Review History</p>
        </div>
        {review.actions.length ? (
          <div className="mt-4 space-y-3">
            {review.actions.map((action) => (
              <div key={action.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-foreground">
                    {action.action === "submitted"
                      ? "Submitted for review"
                      : action.action === "resubmitted"
                        ? "Resubmitted for review"
                        : action.action === "changesRequested"
                          ? "Changes requested"
                          : "Approved"}
                  </p>
                  <span className="text-[11px] text-muted-foreground">
                    v{action.submissionVersion} · {new Date(action.createdAt).toLocaleString()}
                  </span>
                </div>
                {action.note ? <p className="mt-1 text-sm text-muted-foreground">{action.note}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium text-foreground">No review history yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">Submission and reviewer decisions will appear here.</p>
          </div>
        )}
      </section>

      <div
        className={`sticky bottom-3 z-10 rounded-xl border p-3 shadow-lg backdrop-blur ${
          review.status === "approved"
            ? "border-emerald-200 bg-card/95 dark:border-emerald-900/50"
            : ready && editingEnabled
              ? "border-emerald-200 bg-card/95 dark:border-emerald-900/50"
              : "border-border bg-card/95"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {review.status === "approved" || (ready && editingEnabled) ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Clock3 className="h-4 w-4 shrink-0 text-primary" />
              )}
              <p className="text-sm font-semibold text-foreground">
                {review.status === "draft"
                  ? ready
                    ? "Ready to submit"
                    : `${incomplete.length} required section${incomplete.length === 1 ? " needs" : "s need"} attention`
                  : review.status === "changesRequested"
                    ? "Ready to update and resubmit"
                    : review.status === "approved"
                      ? "Course specification approved"
                      : STATUS_META[review.status].label}
              </p>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {review.status === "draft"
                ? ready
                  ? "All 5 required sections are complete. Review the document before submitting."
                  : "Complete the required sections before submitting for review."
                : review.status === "changesRequested"
                  ? "Make the requested changes, then resubmit the updated version."
                  : review.status === "approved"
                    ? "This approved version is read-only."
                    : "The course specification is locked while it is in the review workflow."}
            </p>
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            {editingEnabled ? (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {completed.length}/{readinessItems.length} complete
              </span>
            ) : null}
            <Button variant="outline" onClick={onPreview}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            {review.status === "draft" ? (
              <Button onClick={submit} disabled={!canSubmit}>
                <Send className="mr-2 h-4 w-4" />
                {submitting ? "Submitting…" : "Submit for Review"}
              </Button>
            ) : review.status === "changesRequested" && incomplete.length > 0 ? (
              <Button
                variant="default"
                onClick={() => onGoToSection(incomplete[0]!.id)}
              >
                Continue Editing
              </Button>
            ) : review.status === "changesRequested" ? (
              <Button onClick={submit} disabled={saving || submitting}>
                <Send className="mr-2 h-4 w-4" />
                {submitting ? "Resubmitting…" : "Resubmit for Review"}
              </Button>
            ) : null}
          </div>
        </div>

      </div>

    </div>
  );
}
