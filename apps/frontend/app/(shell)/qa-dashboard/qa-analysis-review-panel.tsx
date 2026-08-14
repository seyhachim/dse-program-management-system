"use client";

import { useState } from "react";
import type {
  QaAnalysisReviewDecision,
  QaAnalysisReviewView,
  QaEvidenceAnalysisView,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";

const PROGRAMME_ID = "dse";

const decisionLabel: Record<QaAnalysisReviewDecision, string> = {
  confirmed: "Confirmed by reviewer",
  rejected: "Rejected by reviewer",
  needsMoreEvidence: "Needs more evidence",
};

export function QaAnalysisReviewPanel({
  analysis,
  reviews,
  canWrite,
  onReviewed,
}: {
  analysis: QaEvidenceAnalysisView;
  reviews: QaAnalysisReviewView[];
  canWrite: boolean;
  onReviewed: () => Promise<void> | void;
}) {
  const latest = reviews[0];
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<QaAnalysisReviewDecision>("confirmed");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/qa/analyses/${analysis.id}/reviews`, {
        programmeId: PROGRAMME_ID,
        decision,
        comment,
      });
      setOpen(false);
      setComment("");
      setDecision("confirmed");
      await onReviewed();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save human review");
    } finally {
      setSaving(false);
    }
  }

  const needsExplanation = decision !== "confirmed";

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-foreground">Human validation</span>
          {latest ? (
            <span className={`rounded-full px-2.5 py-1 font-medium ${reviewClass(latest.decision)}`}>
              {decisionLabel[latest.decision]}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
              Not reviewed
            </span>
          )}
          {reviews.length > 0 ? (
            <span className="text-muted-foreground">
              {reviews.length} review{reviews.length === 1 ? "" : "s"} retained
            </span>
          ) : null}
        </div>
        {canWrite ? (
          <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
            {open ? "Cancel review" : "Review finding"}
          </Button>
        ) : null}
      </div>

      {latest?.comment ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{latest.reviewerName}:</span> {latest.comment}
        </p>
      ) : null}

      {open ? (
        <div className="mt-3 grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[220px_1fr_auto]">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Decision
            <select
              value={decision}
              onChange={(event) => setDecision(event.target.value as QaAnalysisReviewDecision)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="confirmed">Confirm finding</option>
              <option value="rejected">Reject finding</option>
              <option value="needsMoreEvidence">Needs more evidence</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Review comment
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={
                needsExplanation
                  ? "Explain why the finding is rejected or what additional evidence is needed…"
                  : "Optional reviewer note…"
              }
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
          <div className="flex items-end">
            <Button
              size="sm"
              disabled={saving || (needsExplanation && comment.trim().length < 10)}
              onClick={() => void submit()}
            >
              {saving ? "Saving…" : "Save review"}
            </Button>
          </div>
          {error ? <p className="text-xs text-destructive md:col-span-3">{error}</p> : null}
          <p className="text-xs text-muted-foreground md:col-span-3">
            This review is appended to analysis {analysis.id.slice(0, 8)}… and does not alter the analysis or the human AUN-QA self-rating.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function reviewClass(decision: QaAnalysisReviewDecision) {
  if (decision === "confirmed") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (decision === "rejected") {
    return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  return "bg-amber-500/10 text-amber-800 dark:text-amber-300";
}
