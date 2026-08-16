"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  QA_PILOT_SCENARIO_VERSION,
  type QaEvidenceAnalysisState,
  type QaEvaluationMetricsView,
  type QaEvaluationRunView,
  type QaEvaluationScenarioView,
  type QaPilotStatusView,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const stateLabel: Record<QaEvidenceAnalysisState, string> = {
  evidenceIdentified: "Evidence identified",
  potentialEvidenceGap: "Potential evidence gap",
  expertReviewRequired: "Expert review required",
};

type GoldDraft = {
  state: QaEvidenceAnalysisState | "";
  note: string;
  relevantEvidenceIds: string[];
};

type RatingDraft = {
  evidenceRelevance: number;
  explanationClarity: number;
  understandability: number;
  usefulness: number;
  traceability: number;
  comment: string;
};

const defaultRating: RatingDraft = {
  evidenceRelevance: 4,
  explanationClarity: 4,
  understandability: 4,
  usefulness: 4,
  traceability: 4,
  comment: "",
};

export function QaResearchPilotClient() {
  const { me } = useMe();
  const canWrite = me?.permissions.includes("qa:write") ?? false;
  const [status, setStatus] = useState<QaPilotStatusView | null>(null);
  const [scenarios, setScenarios] = useState<QaEvaluationScenarioView[]>([]);
  const [runs, setRuns] = useState<QaEvaluationRunView[]>([]);
  const [metrics, setMetrics] = useState<QaEvaluationMetricsView | null>(null);
  const [goldDrafts, setGoldDrafts] = useState<Record<string, GoldDraft>>({});
  const [ratingRunId, setRatingRunId] = useState<string | null>(null);
  const [ratingDraft, setRatingDraft] = useState<RatingDraft>(defaultRating);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextStatus, allScenarios, allRuns, nextMetrics] = await Promise.all([
        api.get<QaPilotStatusView>("/api/qa/evaluation/pilot/status"),
        api.get<QaEvaluationScenarioView[]>("/api/qa/evaluation/scenarios"),
        api.get<QaEvaluationRunView[]>("/api/qa/evaluation/runs"),
        api.get<QaEvaluationMetricsView>("/api/qa/evaluation/pilot/metrics"),
      ]);
      const prefix = `${QA_PILOT_SCENARIO_VERSION}:`;
      const pilotScenarios = allScenarios.filter((scenario) => scenario.name.startsWith(prefix));
      const ids = new Set(pilotScenarios.map((scenario) => scenario.id));
      setStatus(nextStatus);
      setScenarios(pilotScenarios);
      setRuns(allRuns.filter((run) => ids.has(run.scenarioId)));
      setMetrics(nextMetrics);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the QA research pilot");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const scenariosByRequirement = useMemo(() => {
    const grouped = new Map<string, QaEvaluationScenarioView[]>();
    for (const scenario of scenarios) {
      const group = grouped.get(scenario.requirementCode) ?? [];
      group.push(scenario);
      grouped.set(scenario.requirementCode, group);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [scenarios]);

  const runsByScenario = useMemo(() => {
    const grouped = new Map<string, QaEvaluationRunView[]>();
    for (const run of runs) {
      const group = grouped.get(run.scenarioId) ?? [];
      group.push(run);
      grouped.set(run.scenarioId, group);
    }
    return grouped;
  }, [runs]);

  async function initialize() {
    setBusy("initialize");
    setError(null);
    setMessage(null);
    try {
      const result = await api.post<{ created: number; existing: number; total: number }>(
        "/api/qa/evaluation/pilot/initialize",
        {},
      );
      setMessage(`Pilot scenarios ready: ${result.total} total (${result.created} created, ${result.existing} already present).`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not initialize pilot scenarios");
    } finally {
      setBusy(null);
    }
  }

  function updateGoldDraft(scenarioId: string, patch: Partial<GoldDraft>) {
    setGoldDrafts((current) => ({
      ...current,
      [scenarioId]: {
        state: current[scenarioId]?.state ?? "",
        note: current[scenarioId]?.note ?? "",
        relevantEvidenceIds: current[scenarioId]?.relevantEvidenceIds ?? [],
        ...patch,
      },
    }));
  }

  async function saveGold(scenario: QaEvaluationScenarioView) {
    const draft = goldDrafts[scenario.id];
    if (!draft?.state) {
      setError("Choose a human reference state before saving.");
      return;
    }
    setBusy(`gold:${scenario.id}`);
    setError(null);
    setMessage(null);
    try {
      await api.put(`/api/qa/evaluation/scenarios/${scenario.id}/gold`, {
        goldState: draft.state,
        note: draft.note,
        evidenceJudgments: scenario.evidence.map((evidence) => ({
          evidenceId: evidence.id,
          relevant: draft.relevantEvidenceIds.includes(evidence.id),
        })),
      });
      setMessage(`Human reference classification locked for ${scenario.requirementCode}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the human reference classification");
    } finally {
      setBusy(null);
    }
  }

  async function runPrototype(scenario: QaEvaluationScenarioView, engine: "deterministic" | "llm") {
    setBusy(`${engine}:${scenario.id}`);
    setError(null);
    setMessage(null);
    try {
      const suffix = engine === "deterministic" ? "run-deterministic" : "run-llm";
      await api.post(`/api/qa/evaluation/pilot/scenarios/${scenario.id}/${suffix}`, {});
      setMessage(`${engine === "deterministic" ? "Deterministic" : "LLM-assisted"} pilot run saved for ${scenario.requirementCode}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not run the prototype");
    } finally {
      setBusy(null);
    }
  }

  async function saveRating(run: QaEvaluationRunView) {
    setBusy(`rating:${run.id}`);
    setError(null);
    setMessage(null);
    try {
      await api.post(`/api/qa/evaluation/runs/${run.id}/ratings`, ratingDraft);
      setMessage("Human study rating saved for this exact prototype run.");
      setRatingRunId(null);
      setRatingDraft(defaultRating);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the human study rating");
    } finally {
      setBusy(null);
    }
  }

  async function exportPilot() {
    setBusy("export");
    setError(null);
    try {
      const payload = await api.get<unknown>("/api/qa/evaluation/pilot/export");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `qa-pilot-${QA_PILOT_SCENARIO_VERSION}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not export pilot results");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Controlled pilot protocol</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Experts inspect the scenario evidence and lock the reference classification first. Only then can the prototype run. The system never generates the gold label and never produces an AUN-QA score.
            </p>
          </div>
          <div className="flex gap-2">
            {canWrite && (status?.scenarioCount ?? 0) === 0 ? (
              <Button disabled={busy !== null} onClick={() => void initialize()}>
                {busy === "initialize" ? "Preparing…" : "Initialize 28 scenarios"}
              </Button>
            ) : null}
            <Button variant="outline" disabled={busy !== null || scenarios.length === 0} onClick={() => void exportPilot()}>
              Export pilot JSON
            </Button>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {message ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300">{message}</div> : null}

      {status ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Controlled scenarios" value={`${status.scenarioCount}/${status.expectedScenarioCount}`} />
          <MetricCard label="Expert references locked" value={`${status.goldAnnotatedCount}/${status.expectedScenarioCount}`} />
          <MetricCard label="Deterministic runs" value={String(status.deterministicRunCount)} />
          <MetricCard label="LLM-assisted runs" value={String(status.llmRunCount)} />
        </section>
      ) : null}

      {metrics && metrics.labelledRuns > 0 ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-base font-semibold">Pilot metrics</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Labelled runs" value={String(metrics.labelledRuns)} compact />
            <MetricCard label="Accuracy" value={formatRate(metrics.accuracy)} compact />
            <MetricCard label="Macro F1" value={formatRate(metrics.macroF1)} compact />
            <MetricCard label="Expert referral rate" value={formatRate(metrics.expertReviewReferralRate)} compact />
            <MetricCard label="Retrieval precision" value={formatRate(metrics.evidenceRetrievalPrecision)} compact />
            <MetricCard label="Retrieval recall" value={formatRate(metrics.evidenceRetrievalRecall)} compact />
            <MetricCard label="False gap positives" value={String(metrics.falseGapPositiveCount)} compact />
            <MetricCard label="Human ratings" value={String(metrics.humanRatings.count)} compact />
          </div>
        </section>
      ) : null}

      {scenariosByRequirement.map(([requirementCode, requirementScenarios]) => (
        <section key={requirementCode} className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-muted px-2.5 py-1 text-sm font-semibold">AUN-QA {requirementCode}</span>
            <span className="text-sm text-muted-foreground">2 controlled scenarios</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {requirementScenarios.map((scenario) => {
              const scenarioRuns = runsByScenario.get(scenario.id) ?? [];
              const variant = scenario.name.split(":").at(-1) ?? "";
              const draft = goldDrafts[scenario.id] ?? { state: "", note: "", relevantEvidenceIds: [] };
              return (
                <article key={scenario.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">Scenario {variant}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{scenario.description}</p>
                    </div>
                    {scenario.goldState ? <StateBadge state={scenario.goldState} prefix="Expert reference" /> : <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">Reference pending</span>}
                  </div>

                  <div className="mt-4 space-y-2">
                    {scenario.evidence.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">No supporting record is supplied in this controlled scenario.</div>
                    ) : scenario.evidence.map((evidence) => (
                      <label key={evidence.id} className="flex gap-3 rounded-lg border border-border p-3">
                        {!scenario.goldState && canWrite ? (
                          <input
                            type="checkbox"
                            checked={draft.relevantEvidenceIds.includes(evidence.id)}
                            onChange={(event) => updateGoldDraft(scenario.id, {
                              relevantEvidenceIds: event.target.checked
                                ? [...draft.relevantEvidenceIds, evidence.id]
                                : draft.relevantEvidenceIds.filter((id) => id !== evidence.id),
                            })}
                            className="mt-1"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="font-medium text-foreground">{evidence.label}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{evidence.evidenceType || "context"}</span>
                            {evidence.reportingDate ? <span className="text-muted-foreground">{new Date(evidence.reportingDate).toLocaleDateString()}</span> : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{evidence.text}</p>
                        </div>
                      </label>
                    ))}
                  </div>

                  {!scenario.goldState && canWrite ? (
                    <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs font-medium text-foreground">Independent expert reference classification</p>
                      <select
                        value={draft.state}
                        onChange={(event) => updateGoldDraft(scenario.id, { state: event.target.value as QaEvidenceAnalysisState | "" })}
                        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Choose a state…</option>
                        <option value="evidenceIdentified">Evidence identified</option>
                        <option value="potentialEvidenceGap">Potential evidence gap</option>
                        <option value="expertReviewRequired">Expert review required</option>
                      </select>
                      <textarea
                        value={draft.note}
                        onChange={(event) => updateGoldDraft(scenario.id, { note: event.target.value })}
                        placeholder="Expert rationale (recommended for research traceability)…"
                        className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      />
                      <Button size="sm" disabled={busy !== null || !draft.state} onClick={() => void saveGold(scenario)}>
                        {busy === `gold:${scenario.id}` ? "Locking…" : "Lock reference classification"}
                      </Button>
                    </div>
                  ) : null}

                  {scenario.goldState ? (
                    <div className="mt-4 border-t border-border pt-4">
                      <div className="flex flex-wrap gap-2">
                        {canWrite ? (
                          <>
                            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void runPrototype(scenario, "deterministic")}>Run deterministic</Button>
                            <Button size="sm" variant="outline" disabled={busy !== null || scenario.evidence.length === 0} onClick={() => void runPrototype(scenario, "llm")}>Run LLM-assisted</Button>
                          </>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-3">
                        {scenarioRuns.length === 0 ? <p className="text-xs text-muted-foreground">Reference is locked. No prototype run has been executed yet.</p> : scenarioRuns.map((run) => (
                          <div key={run.id} className="rounded-lg border border-border p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <StateBadge state={run.predictedState} prefix={run.engine === "deterministic-rules" ? "Rules" : `LLM · ${run.engineVersion}`} />
                              {canWrite ? <Button size="sm" variant="outline" onClick={() => { setRatingRunId(ratingRunId === run.id ? null : run.id); setRatingDraft(defaultRating); }}>Rate this run</Button> : null}
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">{run.explanation}</p>
                            <p className="mt-2 text-xs text-muted-foreground">Evidence references retained: {run.retrievedEvidence.length} · {new Date(run.createdAt).toLocaleString()}</p>
                            {ratingRunId === run.id ? <RatingForm draft={ratingDraft} setDraft={setRatingDraft} busy={busy === `rating:${run.id}`} onSave={() => void saveRating(run)} /> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function MetricCard({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`rounded-xl border border-border bg-card ${compact ? "p-3" : "p-4"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`${compact ? "mt-1 text-lg" : "mt-2 text-2xl"} font-semibold text-foreground`}>{value}</p>
    </div>
  );
}

function StateBadge({ state, prefix }: { state: QaEvidenceAnalysisState; prefix: string }) {
  const style = state === "evidenceIdentified"
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : state === "potentialEvidenceGap"
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
      : "bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>{prefix}: {stateLabel[state]}</span>;
}

function RatingForm({ draft, setDraft, busy, onSave }: { draft: RatingDraft; setDraft: (next: RatingDraft) => void; busy: boolean; onSave: () => void }) {
  const fields: Array<[keyof Omit<RatingDraft, "comment">, string]> = [
    ["evidenceRelevance", "Evidence relevance"],
    ["explanationClarity", "Explanation clarity"],
    ["understandability", "Understandability"],
    ["usefulness", "Usefulness"],
    ["traceability", "Traceability"],
  ];
  return (
    <div className="mt-3 grid gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-5">
      {fields.map(([key, label]) => (
        <label key={key} className="grid gap-1 text-xs text-muted-foreground">
          {label}
          <select value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} className="rounded border border-input bg-background px-2 py-1.5 text-sm text-foreground">
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      ))}
      <textarea value={draft.comment} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} placeholder="Optional study comment…" className="min-h-16 rounded border border-input bg-background px-2 py-1.5 text-sm md:col-span-4" />
      <div className="flex items-end"><Button size="sm" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Save rating"}</Button></div>
    </div>
  );
}

function formatRate(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
