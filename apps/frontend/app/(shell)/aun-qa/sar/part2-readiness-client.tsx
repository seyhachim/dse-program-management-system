"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  QaContributorWorkspaceView,
  QaDashboardView,
  QaSarBookPart2Requirement,
  QaSarBookPart2View,
} from "@dse-pms/shared-types";
import { AlertTriangle, CheckCircle2, ChevronDown, FileText, UserRound } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { sarBookRequirementHref } from "./sar-book-navigation";

const PROGRAMME_ID = "dse";

const STATUS_LABELS: Record<QaSarBookPart2Requirement["workflowStatus"], string> = {
  notStarted: "Not started",
  draft: "Draft",
  submitted: "Submitted",
  changesRequested: "Changes requested",
  approved: "Approved",
};

export function Part2ReadinessClient() {
  const { me, loading: meLoading } = useMe();
  const [projection, setProjection] = useState<QaSarBookPart2View | null>(null);
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
        setProjection(null);
        return;
      }
      setProjection(
        await api.get<QaSarBookPart2View>(`/api/qa/cycles/${cycleId}/sar-book/part2?${params}`),
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not assemble SAR Part 2");
    } finally {
      setLoading(false);
    }
  }, [leadershipOrReviewer, me]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [load, me, meLoading]);

  if (meLoading || loading) {
    return <div className="rounded-xl border bg-white p-4 text-sm text-muted-foreground">Assembling Part 2 requirement workflow…</div>;
  }
  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }
  if (!projection) return null;

  const totals = projection.totals;
  return (
    <section className="mx-auto w-full max-w-[1600px] rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Part 2 · Criteria 1–8</div>
          <h2 className="text-lg font-semibold">Requirement assembly & readiness</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            This is a read-only projection of the existing requirement SAR workflow. It does not copy narrative, evidence, assignments, submissions, or approvals into a second system.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">{totals.total} requirements</div>
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Not started" value={totals.notStarted} />
        <Metric label="Draft" value={totals.draft} />
        <Metric label="Submitted" value={totals.submitted} />
        <Metric label="Changes requested" value={totals.changesRequested} />
        <Metric label="Approved" value={totals.approved} />
        <Metric label="Unassigned" value={totals.unassigned} />
      </div>

      {totals.brokenEvidenceReferences > 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          {totals.brokenEvidenceReferences} evidence reference{totals.brokenEvidenceReferences === 1 ? "" : "s"} no longer match current requirement mappings.
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {projection.criteria.map((criterion) => (
          <details key={criterion.criterionId} className="rounded-lg border" open={criterion.criterionCode === "1"}>
            <summary className="cursor-pointer list-none p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 font-medium">
                  <ChevronDown className="h-4 w-4" /> Criterion {criterion.criterionCode} · {criterion.criterionTitle}
                </span>
                <span className="text-xs text-muted-foreground">
                  {criterion.rollup.approved}/{criterion.rollup.total} approved
                </span>
              </div>
            </summary>
            <div className="divide-y border-t">
              {criterion.requirements.map((requirement) => (
                <RequirementRow key={requirement.requirementId} requirement={requirement} />
              ))}
            </div>
          </details>
        ))}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Readiness counts are workflow indicators only, not AUN-QA compliance scores or accreditation decisions.
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-lg font-semibold text-foreground">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

function RequirementRow({ requirement }: { requirement: QaSarBookPart2Requirement }) {
  return (
    <div className="grid gap-3 p-3 text-sm lg:grid-cols-[minmax(0,1fr)_150px_220px_260px] lg:items-center">
      <div className="min-w-0">
        <Link
          href={sarBookRequirementHref(requirement.requirementCode)}
          className="font-medium text-foreground hover:underline"
        >
          {requirement.requirementCode} · {requirement.requirementTitle}
        </Link>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" />
            {requirement.assignment?.assignee.name ?? "Unassigned"}
          </span>
          {requirement.brokenEvidenceReferenceIds.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {requirement.brokenEvidenceReferenceIds.length} broken evidence ref
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <span className="inline-flex rounded-full border px-2 py-1 text-xs font-medium">
          {STATUS_LABELS[requirement.workflowStatus]}
        </span>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="inline-flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          Content: {requirement.currentSource ? "current section" : "missing"}
        </div>
        <div>
          Review: {requirement.latestSubmission ? `submission v${requirement.latestSubmission.submissionVersion}` : "not submitted"}
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {requirement.officialPin ? (
          <div className="inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Official source pinned by ID · approved v{requirement.officialPin.submissionVersion}
          </div>
        ) : (
          <span>Official source: no approved submission</span>
        )}
      </div>
    </div>
  );
}
