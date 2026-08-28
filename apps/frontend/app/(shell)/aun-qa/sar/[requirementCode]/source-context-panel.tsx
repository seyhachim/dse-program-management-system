"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Database, FileSearch, ShieldAlert } from "lucide-react";
import type {
  QaContributorWorkspaceView,
  QaDashboardView,
  QaSarRequirementSourceContext,
  QaSarSourceBlock,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const PROGRAMME_ID = "dse";

const GAP_LABELS: Record<string, string> = {
  evidenceIdentified: "Evidence identified",
  potentialEvidenceGap: "Potential evidence gap",
  expertReviewRequired: "Expert review required",
};

export function SarSourceContextPanel({ requirementCode }: { requirementCode: string }) {
  const { me, loading: meLoading } = useMe();
  const [context, setContext] = useState<QaSarRequirementSourceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const leadershipOrReviewer =
    me?.roles.some((role) => ["admin", "program_coordinator", "qa_reviewer"].includes(role)) ?? false;

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const cycleId = leadershipOrReviewer
        ? (await api.get<QaDashboardView>(`/api/qa/dashboard?${params}`)).selectedCycle?.id
        : (await api.get<QaContributorWorkspaceView>(`/api/qa/workspace/my-work?${params}`)).selectedCycle?.id;
      if (!cycleId) {
        setContext(null);
        return;
      }
      setContext(
        await api.get<QaSarRequirementSourceContext>(
          `/api/qa/cycles/${cycleId}/sar-book/requirements/${encodeURIComponent(requirementCode)}/source-context?${params}`,
        ),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load PMS source context");
    } finally {
      setLoading(false);
    }
  }, [leadershipOrReviewer, me, requirementCode]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [load, me, meLoading]);

  if (meLoading || loading) {
    return <aside className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Loading PMS context…</aside>;
  }
  if (error) {
    return <aside className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</aside>;
  }
  if (!context) return null;

  return (
    <aside className="space-y-4 rounded-xl border bg-white p-4 2xl:sticky 2xl:top-4 2xl:self-start">
      <div>
        <div className="flex items-center gap-2 font-semibold"><Database className="h-4 w-4" /> PMS writing context</div>
        <p className="mt-1 text-xs text-muted-foreground">Read-only projections from canonical PMS/evidence sources. These are writing aids, not AUN-QA scores.</p>
      </div>

      {context.diagnosticPrompts.length > 0 ? (
        <section className="border-t pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnostic prompts</div>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
            {context.diagnosticPrompts.map((prompt) => <li key={prompt}>{prompt}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="border-t pt-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><FileSearch className="h-3.5 w-3.5" /> Evidence analysis</div>
        {context.evidenceGapState ? (
          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs">
            <div className="font-medium">{GAP_LABELS[context.evidenceGapState] ?? context.evidenceGapState}</div>
            {context.evidenceGapExplanation ? <p className="mt-1 text-muted-foreground">{context.evidenceGapExplanation}</p> : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No deterministic evidence-gap analysis has been recorded for this requirement yet.</p>
        )}
      </section>

      <section className="border-t pt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Relevant PMS sources</div>
        <div className="mt-2 space-y-2">
          {context.sourceBlocks.map((block) => <SourceBlock key={block.id} block={block} />)}
          {context.sourceBlocks.length === 0 ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">No structured PMS source is registered for this requirement yet. Missing data is left explicit rather than fabricated.</div>
          ) : null}
        </div>
      </section>
    </aside>
  );
}

function SourceBlock({ block }: { block: QaSarSourceBlock }) {
  const unavailable = block.availability !== "available";
  return (
    <div className={`rounded-lg border p-3 text-xs ${unavailable ? "bg-slate-50" : "bg-white"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium capitalize">{block.title}</div>
        {unavailable ? <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" /> : <Database className="h-3.5 w-3.5 text-primary" />}
      </div>
      <div className="mt-1 text-muted-foreground">{block.description}</div>
      {block.kind === "recordList" && block.records.length > 0 ? (
        <div className="mt-2 space-y-2">
          {block.records.slice(0, 5).map((record) => (
            <div key={record.key} className="rounded bg-slate-50 p-2">
              <div className="font-medium text-foreground">{record.title}</div>
              <div className="mt-0.5 text-muted-foreground">{record.summary}</div>
              {record.periodKey ? <div className="mt-1 text-[11px] text-muted-foreground">Period: {record.periodKey}</div> : null}
            </div>
          ))}
          {block.records.length > 5 ? <div className="text-muted-foreground">+ {block.records.length - 5} more canonical records</div> : null}
        </div>
      ) : null}
      {block.message ? (
        <div className="mt-2 flex items-start gap-1.5 text-muted-foreground">
          {unavailable ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : null}
          <span>{block.message}</span>
        </div>
      ) : null}
      <div className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
        Source snapshot: <span className="font-mono">{block.snapshotKey}</span>
      </div>
    </div>
  );
}
