"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  History,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import type {
  FinalizedResultCorrectionHistory,
  FinalizedResultCorrectionRow,
  FinalizedResultCorrectionWorkspace,
} from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { courseDeliveryApi } from "@/lib/course-delivery";
import {
  correctionCountLabel,
  percentage,
  validateResultCorrection,
  type ResultCorrectionDraft,
} from "@/lib/result-correction";

export function FinalizedResultCorrections({
  offeringId,
  onCorrectionApplied,
}: {
  offeringId: string;
  onCorrectionApplied?: () => Promise<void> | void;
}) {
  const [workspace, setWorkspace] = useState<FinalizedResultCorrectionWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctionTarget, setCorrectionTarget] = useState<FinalizedResultCorrectionRow | null>(null);
  const [historyTarget, setHistoryTarget] = useState<FinalizedResultCorrectionRow | null>(null);

  const loadWorkspace = useCallback(async () => {
    if (!offeringId) {
      setWorkspace(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await courseDeliveryApi.correctionWorkspace(offeringId));
    } catch (reason) {
      setWorkspace(null);
      setError(messageFrom(reason, "Could not load finalized result corrections"));
    } finally {
      setLoading(false);
    }
  }, [offeringId]);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const handleApplied = useCallback(async () => {
    await loadWorkspace();
    await onCorrectionApplied?.();
  }, [loadWorkspace, onCorrectionApplied]);

  return (
    <>
      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Finalized result corrections</h3>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Finalized academic records stay locked. Corrections require a reason, a before/after review, and permanent audit history.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => void loadWorkspace()} disabled={loading || !offeringId}>
            <RefreshCw />{loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {error ? (
          <div className="m-5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {loading && !workspace ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading finalized results…</div>
        ) : null}
        {!loading && workspace && workspace.results.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No finalized results are available for correction in this section yet.
          </div>
        ) : null}
        {workspace && workspace.results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Assessment</th>
                  <th className="px-4 py-3">Current result</th>
                  <th className="px-4 py-3">Finalized</th>
                  <th className="px-4 py-3">Audit</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workspace.results.map((result) => (
                  <tr key={result.assessmentResultId} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-semibold">{result.studentName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{result.studentCode}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">{result.assessmentName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {workspace.courseCode} · Section {workspace.sectionCode}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-lg font-bold">{formatMark(result.score, result.maxScore)}</p>
                      <p className="text-xs text-muted-foreground">{percentage(result.score, result.maxScore)}%</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                        <LockKeyhole className="h-3 w-3" /> Finalized
                      </span>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {result.finalizedByName ?? "Authorized staff"} · {formatDateTime(result.finalizedAt)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {result.correctionSummary.count > 0 ? (
                        <button
                          type="button"
                          className="text-left text-xs font-semibold text-primary underline-offset-4 hover:underline"
                          onClick={() => setHistoryTarget(result)}
                        >
                          {correctionCountLabel(result.correctionSummary.count)}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">No corrections</span>
                      )}
                      {result.correctionSummary.lastCorrectedAt ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Last {formatDateTime(result.correctionSummary.lastCorrectedAt)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Button type="button" size="sm" onClick={() => setCorrectionTarget(result)}>
                        Correct result
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {correctionTarget ? (
        <CorrectionDialog
          key={`${correctionTarget.assessmentResultId}:${correctionTarget.updatedAt}`}
          target={correctionTarget}
          onClose={() => setCorrectionTarget(null)}
          onApplied={handleApplied}
          onReload={loadWorkspace}
        />
      ) : null}
      {historyTarget ? (
        <HistoryDialog
          key={`${historyTarget.assessmentResultId}:${historyTarget.correctionSummary.count}`}
          target={historyTarget}
          onClose={() => setHistoryTarget(null)}
        />
      ) : null}
    </>
  );
}

function CorrectionDialog({
  target,
  onClose,
  onApplied,
  onReload,
}: {
  target: FinalizedResultCorrectionRow;
  onClose: () => void;
  onApplied: () => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [draft, setDraft] = useState<ResultCorrectionDraft>({
    score: String(target.score),
    maxScore: String(target.maxScore),
    feedback: target.feedback,
    reason: "",
  });
  const [checkedRecord, setCheckedRecord] = useState(false);
  const [checkedAudit, setCheckedAudit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const validation = useMemo(
    () => validateResultCorrection(target, draft),
    [draft, target],
  );
  const afterScore = validation.score ?? target.score;
  const afterMaxScore = validation.maxScore ?? target.maxScore;
  const beforePercentage = percentage(target.score, target.maxScore);
  const afterPercentage = percentage(afterScore, afterMaxScore);
  const scoreDelta = afterScore - target.score;

  const confirm = async () => {
    if (!validation.valid || validation.score === null || validation.maxScore === null) return;
    setSubmitting(true);
    setError(null);
    setStale(false);
    try {
      await courseDeliveryApi.correctFinalizedResult({
        assessmentResultId: target.assessmentResultId,
        score: validation.score,
        maxScore: validation.maxScore,
        feedback: validation.feedback,
        reason: validation.reason,
        expectedUpdatedAt: target.updatedAt,
      });
      await onApplied();
      onClose();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setStale(true);
        setError("This finalized result changed after you opened it. Your correction was not applied.");
      } else {
        setError(messageFrom(reason, "Could not correct the finalized result"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const reloadLatest = async () => {
    await onReload();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle>{step === "edit" ? "Correct finalized result" : "Confirm finalized-result correction"}</DialogTitle>
          <DialogDescription>
            This academic result is finalized. The correction will preserve the original publication/finalization provenance and append a permanent audit record.
          </DialogDescription>
        </DialogHeader>

        <ResultContext target={target} />

        {step === "edit" ? (
          <>
            <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Before</p>
                <p className="mt-2 text-2xl font-bold">{formatMark(target.score, target.maxScore)}</p>
                <p className="text-xs text-muted-foreground">{beforePercentage}%</p>
                {target.feedback ? <p className="mt-3 whitespace-pre-wrap text-sm">{target.feedback}</p> : null}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposed after</p>
                <p className="mt-2 text-2xl font-bold">{formatMark(afterScore, afterMaxScore)}</p>
                <p className="text-xs text-muted-foreground">
                  {afterPercentage}% · {formatDelta(scoreDelta)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="correction-score">Score</Label>
                <Input
                  id="correction-score"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.score}
                  onChange={(event) => setDraft((current) => ({ ...current, score: event.target.value }))}
                  aria-invalid={Boolean(validation.errors.score)}
                />
                {validation.errors.score ? <FieldError message={validation.errors.score} /> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="correction-max-score">Maximum score</Label>
                <Input
                  id="correction-max-score"
                  type="number"
                  min="0"
                  step="any"
                  value={draft.maxScore}
                  onChange={(event) => setDraft((current) => ({ ...current, maxScore: event.target.value }))}
                  aria-invalid={Boolean(validation.errors.maxScore)}
                />
                {validation.errors.maxScore ? <FieldError message={validation.errors.maxScore} /> : null}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="correction-feedback">Feedback</Label>
              <textarea
                id="correction-feedback"
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={draft.feedback}
                onChange={(event) => setDraft((current) => ({ ...current, feedback: event.target.value }))}
                maxLength={5000}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="correction-reason">Correction reason *</Label>
              <textarea
                id="correction-reason"
                rows={4}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Explain why this finalized academic record must be corrected."
                value={draft.reason}
                onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
                maxLength={2000}
                aria-invalid={Boolean(validation.errors.reason)}
              />
              <p className="text-xs text-muted-foreground">
                Required. This reason becomes permanent correction-history evidence and cannot later be edited or deleted.
              </p>
              {validation.errors.reason ? <FieldError message={validation.errors.reason} /> : null}
              {validation.errors.noChange ? <FieldError message={validation.errors.noChange} /> : null}
            </div>

            <IntegrityNotice />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="button" onClick={() => setStep("confirm")} disabled={!validation.valid}>
                Review correction <ArrowRight />
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mark change</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xl font-bold">{formatMark(target.score, target.maxScore)}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-xl font-bold">{formatMark(afterScore, afterMaxScore)}</span>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{formatDelta(scoreDelta)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{beforePercentage}% → {afterPercentage}%</p>
            </div>

            {validation.feedback !== target.feedback ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <ComparisonText label="Feedback before" value={target.feedback || "—"} />
                <ComparisonText label="Feedback after" value={validation.feedback || "—"} />
              </div>
            ) : null}

            <div className="rounded-xl border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason for correction</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{validation.reason}</p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Whole-result correction does not recalculate or mutate finalized rubric-criterion/CLO evidence. That evidence remains frozen under the existing academic-integrity rules.
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
                {stale ? (
                  <div className="mt-3">
                    <Button type="button" variant="outline" onClick={() => void reloadLatest()} disabled={submitting}>
                      <RefreshCw /> Reload latest result
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={checkedRecord}
                  onChange={(event) => setCheckedRecord(event.target.checked)}
                />
                <span>I checked the student, assessment, previous result, corrected result, and correction reason.</span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={checkedAudit}
                  onChange={(event) => setCheckedAudit(event.target.checked)}
                />
                <span>I understand this correction becomes permanent audited academic history.</span>
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setStep("edit"); setError(null); setStale(false); }} disabled={submitting}>
                Back
              </Button>
              <Button
                type="button"
                onClick={() => void confirm()}
                disabled={!checkedRecord || !checkedAudit || submitting || stale}
              >
                {submitting ? "Applying correction…" : "Confirm correction"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  target,
  onClose,
}: {
  target: FinalizedResultCorrectionRow;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<FinalizedResultCorrectionHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void courseDeliveryApi.correctionHistory(target.assessmentResultId)
      .then((data) => { if (!cancelled) setHistory(data); })
      .catch((reason) => { if (!cancelled) setError(messageFrom(reason, "Could not load correction history")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [target.assessmentResultId]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Correction history</DialogTitle>
          <DialogDescription>
            Read-only academic audit history for {target.studentName} · {target.assessmentName}.
          </DialogDescription>
        </DialogHeader>

        {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading correction history…</p> : null}
        {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div> : null}
        {history ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current official result</p>
              <p className="mt-2 text-2xl font-bold">{formatMark(history.score, history.maxScore)}</p>
              <p className="text-xs text-muted-foreground">{percentage(history.score, history.maxScore)}%</p>
            </div>

            {history.corrections.length ? history.corrections.map((correction, index) => (
              <article key={correction.correctionId} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">Correction {history.corrections.length - index}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {correction.correctedByName} · {formatDateTime(correction.correctedAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                    {formatMark(correction.beforeScore, correction.beforeMaxScore)} → {formatMark(correction.afterScore, correction.afterMaxScore)}
                  </span>
                </div>
                <div className="mt-3 rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{correction.reason}</p>
                </div>
                {correction.beforeFeedback !== correction.afterFeedback ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <ComparisonText label="Feedback before" value={correction.beforeFeedback || "—"} />
                    <ComparisonText label="Feedback after" value={correction.afterFeedback || "—"} />
                  </div>
                ) : null}
              </article>
            )) : (
              <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                This finalized result has no corrections.
              </p>
            )}

            <div className="rounded-xl border border-border p-4 text-sm">
              <p className="font-semibold">Original official provenance</p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Published</dt>
                  <dd className="font-medium">{history.publishedByName ?? "Authorized staff"} · {formatDateTime(history.publishedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Finalized</dt>
                  <dd className="font-medium">{history.finalizedByName ?? "Authorized staff"} · {formatDateTime(history.finalizedAt)}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultContext({ target }: { target: FinalizedResultCorrectionRow }) {
  return (
    <div className="grid gap-3 rounded-xl border border-border p-4 text-sm sm:grid-cols-2">
      <div>
        <p className="text-xs text-muted-foreground">Student</p>
        <p className="font-semibold">{target.studentName}</p>
        <p className="text-xs text-muted-foreground">{target.studentCode}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Assessment</p>
        <p className="font-semibold">{target.assessmentName}</p>
        <p className="text-xs text-muted-foreground">Finalized {formatDateTime(target.finalizedAt)}</p>
      </div>
    </div>
  );
}

function IntegrityNotice() {
  return (
    <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">Academic-integrity safeguard</p>
        <p className="mt-1 text-xs">
          The PMS preserves the previous and corrected values, actor, reason, timestamp, and original publication/finalization provenance. The finalized record is never unlocked for ordinary editing.
        </p>
      </div>
    </div>
  );
}

function ComparisonText({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

function formatMark(score: number, maxScore: number): string {
  return `${score} / ${maxScore}`;
}

function formatDelta(delta: number): string {
  if (delta === 0) return "No score change";
  return `${delta > 0 ? "+" : ""}${Math.round(delta * 100) / 100} marks`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function messageFrom(reason: unknown, fallback: string) {
  return reason instanceof ApiError || reason instanceof Error ? reason.message : fallback;
}
