"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BookOpenCheck,
  CheckCircle2,
  FileSearch,
  PenLine,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import type {
  ProgrammeRoleAssignmentView,
  QaContributorWorkspaceView,
  QaDashboardView,
  QaRequirementAssignmentView,
  QaSarProgressItemView,
} from "@dse-pms/shared-types";
import { StatusBadge, type StatusBadgeTone } from "@dse-pms/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const PROGRAMME_ID = "dse";

export function AunQaWorkspaceClient() {
  const { me, loading: meLoading } = useMe();
  const canManage = me?.permissions.includes("qa:manage") ?? false;
  const [dashboard, setDashboard] = useState<QaDashboardView | null>(null);
  const [assignments, setAssignments] = useState<QaRequirementAssignmentView[]>([]);
  const [contributors, setContributors] = useState<ProgrammeRoleAssignmentView[]>([]);
  const [sarProgress, setSarProgress] = useState<QaSarProgressItemView[]>([]);
  const [myWorkspace, setMyWorkspace] = useState<QaContributorWorkspaceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      if (me.permissions.includes("qa:manage")) {
        const query = new URLSearchParams({ programmeId: PROGRAMME_ID });
        const dashboardView = await api.get<QaDashboardView>(`/api/qa/dashboard?${query}`);
        setDashboard(dashboardView);
        setMyWorkspace(null);

        const [assignmentRows, contributorRows, progressRows] = await Promise.all([
          dashboardView.selectedCycle
            ? api.get<QaRequirementAssignmentView[]>(
                `/api/qa/cycles/${dashboardView.selectedCycle.id}/assignments?${query}`,
              )
            : Promise.resolve([]),
          api.get<ProgrammeRoleAssignmentView[]>(`/api/auth/programme-roles?${query}`),
          dashboardView.selectedCycle
            ? api.get<QaSarProgressItemView[]>(
                `/api/qa/cycles/${dashboardView.selectedCycle.id}/sar-progress?${query}`,
              )
            : Promise.resolve([]),
        ]);
        setAssignments(assignmentRows);
        setContributors(contributorRows.filter((item) => item.role === "qa_contributor"));
        setSarProgress(progressRows);
      } else {
        const query = new URLSearchParams({ programmeId: PROGRAMME_ID });
        const workspace = await api.get<QaContributorWorkspaceView>(
          `/api/qa/workspace/my-work?${query}`,
        );
        setMyWorkspace(workspace);
        setDashboard(null);
        setAssignments([]);
        setContributors([]);
        setSarProgress([]);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the AUN-QA workspace");
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [load, me, meLoading]);

  const assignmentByRequirement = useMemo(
    () => new Map(assignments.map((item) => [item.requirementCode, item])),
    [assignments],
  );
  const progressByRequirement = useMemo(
    () => new Map(sarProgress.map((item) => [item.requirementCode, item])),
    [sarProgress],
  );
  const evidenceByRequirement = useMemo(() => {
    const counts = new Map<string, { count: number; reviewed: number }>();
    for (const item of dashboard?.evidence ?? []) {
      const current = counts.get(item.requirementCode) ?? { count: 0, reviewed: 0 };
      current.count += 1;
      if (item.status === "reviewed") current.reviewed += 1;
      counts.set(item.requirementCode, current);
    }
    return counts;
  }, [dashboard]);

  async function changeAssignment(requirementCode: string, assigneeId: string) {
    if (!dashboard?.selectedCycle) return;
    setSavingCode(requirementCode);
    setError(null);
    try {
      const path = `/api/qa/cycles/${dashboard.selectedCycle.id}/requirements/${requirementCode}/assignment`;
      if (assigneeId) {
        await api.put<QaRequirementAssignmentView>(path, {
          programmeId: PROGRAMME_ID,
          assigneeId,
        });
      } else {
        const query = new URLSearchParams({ programmeId: PROGRAMME_ID });
        await api.delete(`${path}?${query}`);
      }
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update the requirement owner");
    } finally {
      setSavingCode(null);
    }
  }

  if (meLoading || loading) {
    return <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading AUN-QA workspace…</div>;
  }

  if (!me) {
    return <div className="rounded-xl border border-error/30 bg-error-bg p-4 text-sm text-error">Could not resolve your account.</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error-bg p-4 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {canManage ? (
        <LeadershipWorkspace
          dashboard={dashboard}
          assignments={assignments}
          contributors={contributors}
          assignmentByRequirement={assignmentByRequirement}
          evidenceByRequirement={evidenceByRequirement}
          progressByRequirement={progressByRequirement}
          savingCode={savingCode}
          onChangeAssignment={changeAssignment}
        />
      ) : (
        <ContributorWorkspace workspace={myWorkspace} />
      )}
    </div>
  );
}

function LeadershipWorkspace({
  dashboard,
  assignments,
  contributors,
  assignmentByRequirement,
  evidenceByRequirement,
  progressByRequirement,
  savingCode,
  onChangeAssignment,
}: {
  dashboard: QaDashboardView | null;
  assignments: QaRequirementAssignmentView[];
  contributors: ProgrammeRoleAssignmentView[];
  assignmentByRequirement: Map<string, QaRequirementAssignmentView>;
  evidenceByRequirement: Map<string, { count: number; reviewed: number }>;
  progressByRequirement: Map<string, QaSarProgressItemView>;
  savingCode: string | null;
  onChangeAssignment: (requirementCode: string, assigneeId: string) => Promise<void>;
}) {
  if (!dashboard?.selectedCycle) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <h2 className="text-lg font-semibold">No AUN-QA assessment cycle yet</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Create an assessment cycle from the existing QA Dashboard before assigning SAR work.
        </p>
        <Link href="/qa-dashboard" className="mt-4 inline-flex text-sm font-medium text-primary hover:underline">
          Open QA Dashboard
        </Link>
      </div>
    );
  }

  const evidenceStarted = dashboard.criteria.reduce((sum, item) => sum + item.evidenceCovered, 0);
  const reviewedEvidence = dashboard.criteria.reduce((sum, item) => sum + item.reviewedEvidence, 0);

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current assessment cycle</div>
            <h2 className="mt-1 text-xl font-semibold">{dashboard.selectedCycle.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(dashboard.selectedCycle.reportingStart).toLocaleDateString()} – {new Date(dashboard.selectedCycle.reportingEnd).toLocaleDateString()}
            </p>
          </div>
          <Link href="/qa-dashboard" className="text-sm font-medium text-primary hover:underline">
            Open evidence-analysis dashboard
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={BookOpenCheck} label="AUN-QA requirements" value={dashboard.totals.requirements} help="Work units in this cycle" />
        <SummaryCard icon={UserRoundCheck} label="Assigned" value={assignments.length} help="Requirements with a primary writer" />
        <SummaryCard icon={FileSearch} label="Evidence started" value={evidenceStarted} help="Requirements with at least one evidence item" />
        <SummaryCard icon={CheckCircle2} label="Reviewed evidence" value={reviewedEvidence} help="Requirements with reviewed evidence" />
      </section>

      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-semibold">Requirement ownership and readiness</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Assignment, evidence, SAR writing, and human review are tracked separately. These are workflow signals, not AUN-QA compliance scores.
          </p>
          {contributors.length === 0 ? (
            <p className="mt-3 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
              No QA Contributors are assigned yet. Add lecturers as QA Contributors from the QA Dashboard first.
            </p>
          ) : null}
        </div>

        <div className="divide-y divide-border">
          {dashboard.criteria.map((criterion) => (
            <div key={criterion.code} className="p-4 md:p-5">
              <div className="mb-3 flex items-baseline gap-2">
                <span className="text-sm font-semibold text-primary">Criterion {criterion.code}</span>
                <h3 className="font-semibold">{criterion.title}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-4 font-medium">Requirement</th>
                      <th className="pb-2 pr-4 font-medium">Primary owner</th>
                      <th className="pb-2 pr-4 font-medium">Evidence</th>
                      <th className="pb-2 pr-4 font-medium">SAR writing</th>
                      <th className="pb-2 font-medium">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {criterion.requirements.map((requirement) => {
                      const owner = assignmentByRequirement.get(requirement.code);
                      const evidence = evidenceByRequirement.get(requirement.code) ?? { count: 0, reviewed: 0 };
                      const progress = progressByRequirement.get(requirement.code);
                      return (
                        <tr key={requirement.code}>
                          <td className="py-3 pr-4">
                            <Link href={`/aun-qa/sar/${requirement.code}`} className="font-medium text-primary hover:underline">
                              {requirement.code}
                            </Link>
                            <div className="mt-0.5 max-w-md text-xs text-muted-foreground">{requirement.title}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <select
                              value={owner?.assignee.id ?? ""}
                              disabled={savingCode === requirement.code}
                              onChange={(event) => void onChangeAssignment(requirement.code, event.target.value)}
                              className="h-9 min-w-48 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
                            >
                              <option value="">Unassigned</option>
                              {contributors.map((person) => (
                                <option key={person.userId} value={person.userId}>{person.userName}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 pr-4">
                            {evidence.count === 0 ? (
                              <StatusBadge tone="neutral" label="No evidence yet" icon={false} />
                            ) : evidence.reviewed === evidence.count ? (
                              <StatusBadge tone="success" label={`${evidence.count} reviewed`} icon={false} />
                            ) : (
                              <StatusBadge tone="warning" label={`${evidence.count} collected · ${evidence.reviewed} reviewed`} icon={false} />
                            )}
                          </td>
                          <td className="py-3 pr-4">
                            <Link href={`/aun-qa/sar/${requirement.code}`} className="text-xs font-medium text-primary hover:underline">
                              {progress?.status === "approved" ? "Approved" : progress?.status === "underReview" ? "Submitted" : progress?.status === "changesRequested" ? "Revise" : progress ? "Drafting" : "Open editor"}
                            </Link>
                          </td>
                          <td className="py-3">
                            <StatusBadge
                              tone={progress?.status === "approved" ? "success" : progress?.status === "underReview" || progress?.status === "changesRequested" ? "warning" : "neutral"}
                              label={progress?.status === "approved" ? "Approved" : progress?.status === "underReview" ? "Under review" : progress?.status === "changesRequested" ? "Changes requested" : "Not submitted"}
                              icon={false}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ContributorWorkspace({ workspace }: { workspace: QaContributorWorkspaceView | null }) {
  if (!workspace?.selectedCycle) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8">
        <h2 className="text-lg font-semibold">No active AUN-QA work yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your programme has not started an assessment cycle.</p>
      </div>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My AUN-QA work</div>
        <h2 className="mt-1 text-xl font-semibold">{workspace.selectedCycle.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You see only requirements currently assigned to you. Evidence, writing, and review readiness remain separate.
        </p>
      </section>

      {workspace.work.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <ShieldCheck className="mx-auto h-9 w-9 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">Nothing assigned to you yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">The Head of Programme will assign AUN-QA requirements when work is ready.</p>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {workspace.work.map((item) => (
            <article key={item.assignment.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-primary">{item.assignment.requirementCode}</div>
                  <h3 className="mt-1 font-semibold">{item.assignment.requirementTitle}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Criterion {item.assignment.criterionCode} · {item.assignment.criterionTitle}</p>
                </div>
                <PenLine className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
                <ReadinessBox label="Evidence" value={item.evidence.count === 0 ? "None yet" : `${item.evidence.count} collected`} tone={item.evidence.readiness === "reviewed" ? "success" : item.evidence.readiness === "collected" ? "warning" : "neutral"} />
                <ReadinessBox
                  label="SAR writing"
                  value={item.writingStatus === "approved" ? "Approved" : item.writingStatus === "submitted" ? "Submitted" : item.writingStatus === "drafting" ? "Drafting" : "Not started"}
                  tone={item.writingStatus === "approved" ? "success" : item.writingStatus === "submitted" ? "warning" : "neutral"}
                />
                <ReadinessBox
                  label="Review"
                  value={item.reviewStatus === "approved" ? "Approved" : item.reviewStatus === "underReview" ? "Under review" : item.reviewStatus === "changesRequested" ? "Changes requested" : "Not submitted"}
                  tone={item.reviewStatus === "approved" ? "success" : item.reviewStatus === "underReview" || item.reviewStatus === "changesRequested" ? "warning" : "neutral"}
                />
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">Write the narrative around mapped evidence and PMS data.</p>
                <Link
                  href={`/aun-qa/sar/${item.assignment.requirementCode}`}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                >
                  Open SAR editor
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

function SummaryCard({ icon: Icon, label, value, help }: { icon: typeof ShieldCheck; label: string; value: number; help: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{help}</div>
    </div>
  );
}

function ReadinessBox({ label, value, tone }: { label: string; value: string; tone: Extract<StatusBadgeTone, "neutral" | "success" | "warning"> }) {
  return (
    <div className="rounded-lg bg-surface-secondary p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2"><StatusBadge tone={tone} label={value} icon={false} /></div>
    </div>
  );
}