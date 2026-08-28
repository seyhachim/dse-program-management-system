"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  QaContributorWorkspaceView,
  QaDashboardView,
  QaSarBookEvidenceRegisterView,
  QaSarBookNarrativeSectionView,
  QaSarBookPart3View,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { SAR_BOOK_MODE_HREFS } from "../sar-book-navigation";

const PROGRAMME_ID = "dse";
const ratingOptions = [1, 2, 3, 4, 5, 6, 7] as const;

type RatingDraft = { rating: number; text: string; evidenceIds: string[] };

export function SarBookPart3Client() {
  const { me, loading: meLoading } = useMe();
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [part3, setPart3] = useState<QaSarBookPart3View | null>(null);
  const [evidence, setEvidence] = useState<QaSarBookEvidenceRegisterView | null>(null);
  const [strengths, setStrengths] = useState<QaSarBookNarrativeSectionView | null>(null);
  const [weaknesses, setWeaknesses] = useState<QaSarBookNarrativeSectionView | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leadershipOrReviewer =
    me?.roles.some((role) => ["admin", "program_coordinator", "qa_reviewer"].includes(role)) ?? false;
  const canWrite = Boolean(me?.permissions.includes("qa:write") && leadershipOrReviewer);

  const load = useCallback(async () => {
    if (!me) return;
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const selectedCycleId = leadershipOrReviewer
        ? (await api.get<QaDashboardView>(`/api/qa/dashboard?${params}`)).selectedCycle?.id
        : (await api.get<QaContributorWorkspaceView>(`/api/qa/workspace/my-work?${params}`)).selectedCycle?.id;
      if (!selectedCycleId) {
        setCycleId(null);
        setPart3(null);
        return;
      }
      setCycleId(selectedCycleId);
      const [loadedPart3, loadedEvidence, loadedStrengths, loadedWeaknesses] = await Promise.all([
        api.get<QaSarBookPart3View>(`/api/qa/cycles/${selectedCycleId}/sar-book/part3?${params}`),
        api.get<QaSarBookEvidenceRegisterView>(
          `/api/qa/cycles/${selectedCycleId}/sar-book/evidence-register?${new URLSearchParams({ programmeId: PROGRAMME_ID, mode: "working" })}`,
        ),
        api.get<QaSarBookNarrativeSectionView>(
          `/api/qa/cycles/${selectedCycleId}/sar-book/sections/part3.strengths?${params}`,
        ),
        api.get<QaSarBookNarrativeSectionView>(
          `/api/qa/cycles/${selectedCycleId}/sar-book/sections/part3.weaknesses?${params}`,
        ),
      ]);
      setPart3(loadedPart3);
      setEvidence(loadedEvidence);
      setStrengths(loadedStrengths);
      setWeaknesses(loadedWeaknesses);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load SAR Part 3");
    }
  }, [leadershipOrReviewer, me]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [load, me, meLoading]);

  const requirementOptions = useMemo(
    () => part3?.criteria.flatMap((criterion) => criterion.requirements) ?? [],
    [part3],
  );

  async function saveRequirement(requirementCode: string, draft: RatingDraft) {
    if (!cycleId || !canWrite) return;
    setSavingKey(`requirement:${requirementCode}`);
    setError(null);
    try {
      const updated = await api.put<QaSarBookPart3View>(
        `/api/qa/cycles/${cycleId}/sar-book/part3/requirements/${requirementCode}/rating`,
        {
          programmeId: PROGRAMME_ID,
          rating: draft.rating,
          justification: draft.text,
          evidenceIds: draft.evidenceIds,
        },
      );
      setPart3(updated);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save requirement self-rating");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveCriterion(criterionCode: string, draft: RatingDraft) {
    if (!cycleId || !canWrite) return;
    setSavingKey(`criterion:${criterionCode}`);
    setError(null);
    try {
      const updated = await api.put<QaSarBookPart3View>(
        `/api/qa/cycles/${cycleId}/sar-book/part3/criteria/${criterionCode}/rating`,
        {
          programmeId: PROGRAMME_ID,
          rating: draft.rating,
          opinion: draft.text,
          evidenceIds: draft.evidenceIds,
        },
      );
      setPart3(updated);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save criterion self-rating");
    } finally {
      setSavingKey(null);
    }
  }

  async function addAssociation(kind: "strength" | "weakness", criterionCode: string, requirementCode: string) {
    if (!cycleId || !canWrite) return;
    const section = kind === "strength" ? strengths : weaknesses;
    if (!section?.revisionId) {
      setError(`Save the ${kind === "strength" ? "Strengths" : "Weaknesses"} narrative before linking it.`);
      return;
    }
    setSavingKey(`association:${kind}`);
    try {
      const updated = await api.post<QaSarBookPart3View>(
        `/api/qa/cycles/${cycleId}/sar-book/part3/associations`,
        {
          programmeId: PROGRAMME_ID,
          revisionId: section.revisionId,
          kind,
          criterionCode: criterionCode || null,
          requirementCode: requirementCode || null,
        },
      );
      setPart3(updated);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add Part 3 analysis link");
    } finally {
      setSavingKey(null);
    }
  }

  async function removeAssociation(id: string) {
    if (!cycleId || !canWrite) return;
    setSavingKey(`association:${id}`);
    try {
      await api.delete(
        `/api/qa/cycles/${cycleId}/sar-book/part3/associations/${id}?${new URLSearchParams({ programmeId: PROGRAMME_ID })}`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not remove Part 3 analysis link");
    } finally {
      setSavingKey(null);
    }
  }

  if (meLoading || (!part3 && cycleId !== null && !error)) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">Loading SAR Part 3…</div>;
  }
  if (!part3) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">No accessible AUN-QA assessment cycle was found.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <header className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-primary">AUN-QA SAR · Part 3</div>
            <h1 className="text-2xl font-semibold">Strengths, Weaknesses, Self-Ratings & Improvement Plan</h1>
            <p className="mt-2 max-w-4xl text-sm text-muted-foreground">{part3.note}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href={SAR_BOOK_MODE_HREFS.content} className="rounded-md border px-3 py-2">Book</Link>
            <Link href={SAR_BOOK_MODE_HREFS.evidence} className="rounded-md border px-3 py-2">Evidence</Link>
            <Link href={SAR_BOOK_MODE_HREFS.review} className="rounded-md border px-3 py-2">Review</Link>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <Metric label="Requirements rated" value={`${part3.readiness.ratedRequirements}/${part3.readiness.totalRequirements}`} />
          <Metric label="Criteria rated" value={`${part3.readiness.ratedCriteria}/${part3.readiness.totalCriteria}`} />
          <Metric label="Improvement actions" value={String(part3.improvementActions.length)} />
          <Metric label="Narrative links" value={String(part3.associations.length)} />
        </div>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <NarrativeLinkPanel
          title="1. Summary of Strengths"
          section={strengths}
          kind="strength"
          part3={part3}
          canWrite={canWrite}
          savingKey={savingKey}
          requirementOptions={requirementOptions}
          onAdd={addAssociation}
          onRemove={removeAssociation}
        />
        <NarrativeLinkPanel
          title="2. Summary of Weaknesses / Areas for Improvement"
          section={weaknesses}
          kind="weakness"
          part3={part3}
          canWrite={canWrite}
          savingKey={savingKey}
          requirementOptions={requirementOptions}
          onAdd={addAssociation}
          onRemove={removeAssociation}
        />
      </section>

      <section className="rounded-xl border bg-white p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">3. Programme Self-Ratings</h2>
          <p className="text-sm text-muted-foreground">
            Enter the SAR team&apos;s human judgement only. Evidence/readiness counts never set these values automatically, and PMS does not calculate an overall accreditation verdict.
          </p>
        </div>
        <div className="space-y-4">
          {part3.criteria.map((criterion) => (
            <details key={criterion.criterionId} className="rounded-lg border" open={criterion.criterionCode === "1"}>
              <summary className="cursor-pointer px-4 py-3 font-medium">
                Criterion {criterion.criterionCode} · {criterion.criterionTitle} · {criterion.rating ?? "Not rated"}/7
              </summary>
              <div className="space-y-4 border-t p-4">
                <RatingEditor
                  key={`criterion-${criterion.revisionId ?? "new"}`}
                  label={`Criterion ${criterion.criterionCode} overall opinion`}
                  initial={{
                    rating: criterion.rating ?? 1,
                    text: criterion.opinion,
                    evidenceIds: criterion.evidence.map((item) => item.id),
                  }}
                  evidence={evidence?.items ?? []}
                  canWrite={canWrite}
                  saving={savingKey === `criterion:${criterion.criterionCode}`}
                  onSave={(draft) => saveCriterion(criterion.criterionCode, draft)}
                />
                <div className="space-y-3">
                  {criterion.requirements.map((requirement) => (
                    <RatingEditor
                      key={`${requirement.requirementId}-${requirement.revisionId ?? "new"}`}
                      label={`${requirement.requirementCode} · ${requirement.requirementTitle}`}
                      initial={{
                        rating: requirement.rating ?? 1,
                        text: requirement.justification,
                        evidenceIds: requirement.evidence.map((item) => item.id),
                      }}
                      evidence={evidence?.items.filter((item) =>
                        item.usages.some((usage) => usage.requirementCode === requirement.requirementCode),
                      ) ?? []}
                      canWrite={canWrite}
                      saving={savingKey === `requirement:${requirement.requirementCode}`}
                      onSave={(draft) => saveRequirement(requirement.requirementCode, draft)}
                    />
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-lg font-semibold">4. Structured Improvement Plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These are canonical CQI actions created from validated QA findings and human review. Part 3 does not duplicate or detach them from their analysis/review provenance.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2">Requirement</th><th className="p-2">Action</th><th className="p-2">Owner</th><th className="p-2">Target</th><th className="p-2">Status</th><th className="p-2">Follow-up evidence</th><th className="p-2">Result / effectiveness</th></tr></thead>
            <tbody>
              {part3.improvementActions.map((action) => (
                <tr key={action.id} className="border-b align-top">
                  <td className="p-2 font-medium">{action.requirementCode}</td>
                  <td className="p-2"><div>{action.plannedAction}</div><div className="mt-1 text-xs text-muted-foreground">Indicator: {action.indicator || "Not provided"}</div></td>
                  <td className="p-2">{action.ownerName ?? "Unassigned"}</td>
                  <td className="p-2">{action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "Not set"}</td>
                  <td className="p-2">{action.status}{action.overdue ? " · overdue" : ""}</td>
                  <td className="p-2">{action.followUpEvidenceCount}</td>
                  <td className="p-2"><div>{action.result || "—"}</div><div className="mt-1 text-xs text-muted-foreground">{action.effectivenessReview || "No effectiveness review yet"}</div></td>
                </tr>
              ))}
              {part3.improvementActions.length === 0 ? (
                <tr><td colSpan={7} className="p-5 text-center text-muted-foreground">No canonical improvement actions are linked to this cycle yet. Create actions only from validated QA gap/uncertainty findings; do not create report-only duplicates.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}

function RatingEditor({
  label,
  initial,
  evidence,
  canWrite,
  saving,
  onSave,
}: {
  label: string;
  initial: RatingDraft;
  evidence: QaSarBookEvidenceRegisterView["items"];
  canWrite: boolean;
  saving: boolean;
  onSave: (draft: RatingDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="font-medium">{label}</div>
      <div className="mt-3 grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
        <label className="text-sm">Rating (1–7)
          <select
            value={draft.rating}
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, rating: Number(event.target.value) }))}
            className="mt-1 h-9 w-full rounded-md border bg-white px-2"
          >
            {ratingOptions.map((rating) => <option key={rating} value={rating}>{rating}</option>)}
          </select>
        </label>
        <label className="text-sm">Human justification / opinion
          <textarea
            value={draft.text}
            disabled={!canWrite}
            onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-md border bg-white p-2"
            placeholder="Record the SAR team's judgement and rationale…"
          />
        </label>
      </div>
      {evidence.length ? (
        <label className="mt-3 block text-sm">Supporting evidence
          <select
            multiple
            value={draft.evidenceIds}
            disabled={!canWrite}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                evidenceIds: Array.from(event.currentTarget.selectedOptions, (option) => option.value),
              }))
            }
            className="mt-1 min-h-24 w-full rounded-md border bg-white p-2"
          >
            {evidence.map((item) => <option key={item.evidenceId} value={item.evidenceId}>{item.citationText} · {item.title}</option>)}
          </select>
        </label>
      ) : null}
      {canWrite ? (
        <button
          type="button"
          disabled={saving || draft.text.trim().length < 10}
          onClick={() => void onSave(draft)}
          className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save human judgement"}
        </button>
      ) : null}
    </div>
  );
}

function NarrativeLinkPanel({
  title,
  section,
  kind,
  part3,
  canWrite,
  savingKey,
  requirementOptions,
  onAdd,
  onRemove,
}: {
  title: string;
  section: QaSarBookNarrativeSectionView | null;
  kind: "strength" | "weakness";
  part3: QaSarBookPart3View;
  canWrite: boolean;
  savingKey: string | null;
  requirementOptions: QaSarBookPart3View["criteria"][number]["requirements"];
  onAdd: (kind: "strength" | "weakness", criterionCode: string, requirementCode: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [criterionCode, setCriterionCode] = useState("");
  const [requirementCode, setRequirementCode] = useState("");
  const links = part3.associations.filter((item) => item.kind === kind);
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{section?.revisionNumber ? `Current narrative revision ${section.revisionNumber}` : "No saved narrative revision yet"}</p></div>
        <Link href={SAR_BOOK_MODE_HREFS.content} className="rounded-md border px-3 py-2 text-xs">Edit narrative</Link>
      </div>
      <div className="mt-4 space-y-2">
        {links.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 p-2 text-sm">
            <span>{item.requirementCode ? `${item.requirementCode} · ${item.requirementTitle}` : `Criterion ${item.criterionCode} · ${item.criterionTitle}`}</span>
            {canWrite ? <button type="button" disabled={savingKey === `association:${item.id}`} onClick={() => void onRemove(item.id)} className="text-xs text-red-600">Remove</button> : null}
          </div>
        ))}
        {links.length === 0 ? <p className="text-sm text-muted-foreground">No criterion/requirement associations on the current exact revision.</p> : null}
      </div>
      {canWrite && section?.revisionId ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select value={criterionCode} onChange={(event) => setCriterionCode(event.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Criterion (optional)</option>
            {part3.criteria.map((criterion) => <option key={criterion.criterionId} value={criterion.criterionCode}>{criterion.criterionCode} · {criterion.criterionTitle}</option>)}
          </select>
          <select value={requirementCode} onChange={(event) => setRequirementCode(event.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Requirement (optional)</option>
            {requirementOptions.map((requirement) => <option key={requirement.requirementId} value={requirement.requirementCode}>{requirement.requirementCode} · {requirement.requirementTitle}</option>)}
          </select>
          <button type="button" disabled={savingKey === `association:${kind}` || (!criterionCode && !requirementCode)} onClick={() => void onAdd(kind, criterionCode, requirementCode)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Add link</button>
        </div>
      ) : null}
    </div>
  );
}
