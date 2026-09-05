"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MyActionResearchView,
  ResearchAssignmentRole,
  ResearchProjectPage,
  ResearchProjectView,
  ResearchProtocolView,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  invalidateProtectedQueryResources,
  protectedQueryKey,
  QUERY_STALE_MS,
} from "@/lib/query-client";

const PROGRAMME_ID = "dse";
const PROJECT_PAGE_SIZE = 50;

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500";
const cardClass = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

function splitList(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function StatusPill({ value }: { value: string }) {
  const normalized = value.replaceAll("_", " ").toLowerCase();
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
      {normalized}
    </span>
  );
}

interface ProtocolFormState {
  practicalProblem: string;
  researchQuestion: string;
  systemBoundary: string;
  baselinePattern: string;
  dynamicHypothesis: string;
  interventionPlan: string;
  expectedDelay: string;
  primaryIndicators: string;
  secondaryIndicators: string;
  successCriteria: string;
  comparisonDesign: string;
  dataSources: string;
  analysisPlan: string;
  fidelityPlan: string;
  ethicsPrivacyStatus: string;
  validityRisks: string;
  plannedReflectionDate: string;
}

const emptyProtocol: ProtocolFormState = {
  practicalProblem: "",
  researchQuestion: "",
  systemBoundary: "",
  baselinePattern: "",
  dynamicHypothesis: "",
  interventionPlan: "",
  expectedDelay: "",
  primaryIndicators: "",
  secondaryIndicators: "",
  successCriteria: "",
  comparisonDesign: "",
  dataSources: "",
  analysisPlan: "",
  fidelityPlan: "",
  ethicsPrivacyStatus: "",
  validityRisks: "",
  plannedReflectionDate: "",
};

function protocolState(protocol: ResearchProtocolView | null, project: ResearchProjectView): ProtocolFormState {
  if (!protocol) {
    return {
      ...emptyProtocol,
      practicalProblem: project.problemStatement,
      researchQuestion: project.researchQuestion,
    };
  }
  return {
    practicalProblem: protocol.practicalProblem,
    researchQuestion: protocol.researchQuestion,
    systemBoundary: protocol.systemBoundary,
    baselinePattern: protocol.baselinePattern,
    dynamicHypothesis: protocol.dynamicHypothesis,
    interventionPlan: protocol.interventionPlan,
    expectedDelay: protocol.expectedDelay,
    primaryIndicators: protocol.primaryIndicators.join(", "),
    secondaryIndicators: protocol.secondaryIndicators.join(", "),
    successCriteria: protocol.successCriteria,
    comparisonDesign: protocol.comparisonDesign,
    dataSources: protocol.dataSources.join("\n"),
    analysisPlan: protocol.analysisPlan,
    fidelityPlan: protocol.fidelityPlan,
    ethicsPrivacyStatus: protocol.ethicsPrivacyStatus,
    validityRisks: protocol.validityRisks,
    plannedReflectionDate: protocol.plannedReflectionDate?.slice(0, 10) ?? "",
  };
}

export function ActionResearchClient() {
  const { me, loading: meLoading } = useMe();
  const queryClient = useQueryClient();
  const [myWork, setMyWork] = useState<MyActionResearchView | null>(null);
  const [selectedProject, setSelectedProject] = useState<ResearchProjectView | null>(null);
  const [pageCursor, setPageCursor] = useState<string | undefined>(undefined);
  const [previousCursors, setPreviousCursors] = useState<Array<string | undefined>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roles = me?.roles ?? [];
  const canManage = roles.some((role) => role === "admin" || role === "program_coordinator");
  const canReview = roles.some(
    (role) => role === "admin" || role === "program_coordinator" || role === "qa_reviewer",
  );

  const projectPageQuery = useQuery({
    queryKey: protectedQueryKey(
      { userId: me?.id ?? "pending", programmeId: PROGRAMME_ID },
      "action-research-projects",
      "page",
      pageCursor ?? "first",
      PROJECT_PAGE_SIZE,
    ),
    queryFn: () => {
      const params = new URLSearchParams({
        programmeId: PROGRAMME_ID,
        limit: String(PROJECT_PAGE_SIZE),
      });
      if (pageCursor) params.set("cursor", pageCursor);
      return api.get<ResearchProjectPage>(`/api/qa/action-research/projects/page?${params}`);
    },
    enabled: Boolean(me?.id && canManage),
    staleTime: QUERY_STALE_MS.operational,
    placeholderData: keepPreviousData,
  });

  const projects = projectPageQuery.data?.items ?? [];
  const canAdvanceProjectPage =
    !projectPageQuery.isFetching &&
    !projectPageQuery.isPlaceholderData &&
    !projectPageQuery.isError &&
    Boolean(projectPageQuery.data?.nextCursor);

  const [newProject, setNewProject] = useState({
    title: "",
    problemStatement: "",
    researchQuestion: "",
    academicYear: "2026-2027",
    semester: "",
  });
  const [assignment, setAssignment] = useState({
    assigneeId: "",
    role: "LEAD_RESEARCHER" as ResearchAssignmentRole,
    instructions: "",
    dueDate: "",
  });
  const [protocol, setProtocol] = useState<ProtocolFormState>(emptyProtocol);
  const [reviewComment, setReviewComment] = useState("");
  const [baseline, setBaseline] = useState({
    baselineStart: "",
    baselineEnd: "",
    key: "",
    label: "",
    unit: "%",
    value: "",
    denominator: "",
    sourceRef: "",
  });

  const loadSelected = useCallback(async (projectId: string) => {
    const detail = await api.get<ResearchProjectView>(
      `/api/qa/action-research/projects/${projectId}?programmeId=${encodeURIComponent(PROGRAMME_ID)}`,
    );
    setSelectedProject(detail);
    return detail;
  }, []);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const mine = await api.get<MyActionResearchView>(
        `/api/qa/action-research/my-work?programmeId=${encodeURIComponent(PROGRAMME_ID)}`,
      );
      setMyWork(mine);
      if (selectedProject) {
        await loadSelected(selectedProject.id);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [loadSelected, me, selectedProject]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [me, meLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedProject) return;
    setProtocol(protocolState(selectedProject.currentCycle?.currentProtocol ?? null, selectedProject));
    setReviewComment("");
  }, [selectedProject]);

  const mySelectedAssignment = useMemo(
    () => selectedProject?.assignments.find((item) => item.assigneeId === me?.id),
    [me?.id, selectedProject],
  );
  const canEditProtocol =
    mySelectedAssignment?.role === "LEAD_RESEARCHER" || mySelectedAssignment?.role === "CO_RESEARCHER";

  async function runAction(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await invalidateProtectedQueryResources(queryClient, ["action-research-projects"]);
      await load();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    await runAction(async () => {
      const created = await api.post<ResearchProjectView>("/api/qa/action-research/projects", {
        programmeId: PROGRAMME_ID,
        ...newProject,
      });
      setSelectedProject(created);
      setPageCursor(undefined);
      setPreviousCursors([]);
      setNewProject({
        title: "",
        problemStatement: "",
        researchQuestion: "",
        academicYear: "2026-2027",
        semester: "",
      });
    }, "Action Research project created.");
  }

  async function saveAssignment(event: FormEvent) {
    event.preventDefault();
    if (!selectedProject) return;
    await runAction(async () => {
      await api.post(`/api/qa/action-research/projects/${selectedProject.id}/assignments`, {
        programmeId: PROGRAMME_ID,
        assigneeId: assignment.assigneeId,
        role: assignment.role,
        instructions: assignment.instructions,
        dueDate: assignment.dueDate || null,
      });
      setAssignment({ assigneeId: "", role: "LEAD_RESEARCHER", instructions: "", dueDate: "" });
      await loadSelected(selectedProject.id);
    }, "Research assignment saved.");
  }

  async function updateAssignmentStatus(status: "ACCEPTED" | "IN_PROGRESS") {
    if (!mySelectedAssignment) return;
    await runAction(async () => {
      await api.patch(`/api/qa/action-research/assignments/${mySelectedAssignment.id}/status`, {
        programmeId: PROGRAMME_ID,
        status,
      });
      if (selectedProject) await loadSelected(selectedProject.id);
    }, status === "ACCEPTED" ? "Assignment accepted." : "Research started.");
  }

  async function saveProtocol(event: FormEvent) {
    event.preventDefault();
    const cycleId = selectedProject?.currentCycle?.id;
    if (!cycleId) return;
    await runAction(async () => {
      await api.put(`/api/qa/action-research/cycles/${cycleId}/protocol`, {
        programmeId: PROGRAMME_ID,
        practicalProblem: protocol.practicalProblem,
        researchQuestion: protocol.researchQuestion,
        systemBoundary: protocol.systemBoundary,
        baselinePattern: protocol.baselinePattern,
        dynamicHypothesis: protocol.dynamicHypothesis,
        interventionPlan: protocol.interventionPlan,
        expectedDelay: protocol.expectedDelay,
        primaryIndicators: splitList(protocol.primaryIndicators),
        secondaryIndicators: splitList(protocol.secondaryIndicators),
        successCriteria: protocol.successCriteria,
        comparisonDesign: protocol.comparisonDesign,
        dataSources: splitList(protocol.dataSources),
        analysisPlan: protocol.analysisPlan,
        fidelityPlan: protocol.fidelityPlan,
        ethicsPrivacyStatus: protocol.ethicsPrivacyStatus,
        validityRisks: protocol.validityRisks,
        plannedReflectionDate: protocol.plannedReflectionDate || null,
      });
      await loadSelected(selectedProject.id);
    }, "Research protocol saved.");
  }

  async function submitProtocol() {
    const cycleId = selectedProject?.currentCycle?.id;
    if (!cycleId) return;
    await runAction(async () => {
      await api.post(`/api/qa/action-research/cycles/${cycleId}/protocol/submit`, {
        programmeId: PROGRAMME_ID,
      });
      await loadSelected(selectedProject.id);
    }, "Protocol submitted for review.");
  }

  async function reviewProtocol(action: "APPROVE" | "REQUEST_REVISION") {
    const currentProtocol = selectedProject?.currentCycle?.currentProtocol;
    if (!currentProtocol) return;
    await runAction(async () => {
      await api.post(`/api/qa/action-research/protocols/${currentProtocol.id}/review`, {
        programmeId: PROGRAMME_ID,
        action,
        comment: reviewComment,
      });
      await loadSelected(selectedProject.id);
    }, action === "APPROVE" ? "Protocol approved." : "Revision requested.");
  }

  async function lockBaseline(event: FormEvent) {
    event.preventDefault();
    const cycleId = selectedProject?.currentCycle?.id;
    if (!cycleId) return;
    await runAction(async () => {
      await api.post(`/api/qa/action-research/cycles/${cycleId}/baseline-lock`, {
        programmeId: PROGRAMME_ID,
        baselineStart: baseline.baselineStart,
        baselineEnd: baseline.baselineEnd,
        indicatorDefinitions: [
          {
            key: baseline.key,
            label: baseline.label,
            unit: baseline.unit,
            value: baseline.value === "" ? null : Number(baseline.value),
            denominator: baseline.denominator === "" ? null : Number(baseline.denominator),
            sourceRef: baseline.sourceRef,
          },
        ],
      });
      await loadSelected(selectedProject.id);
    }, "Baseline locked for this research cycle.");
  }

  function handleNextProjectPage() {
    const nextCursor = projectPageQuery.data?.nextCursor;
    if (!nextCursor || !canAdvanceProjectPage) return;
    setSelectedProject(null);
    setPreviousCursors((current) => [...current, pageCursor]);
    setPageCursor(nextCursor);
  }

  function handlePreviousProjectPage() {
    if (previousCursors.length === 0 || projectPageQuery.isFetching) return;
    const previous = previousCursors[previousCursors.length - 1];
    setSelectedProject(null);
    setPreviousCursors((current) => current.slice(0, -1));
    setPageCursor(previous);
  }

  const projectColdLoading = canManage && projectPageQuery.data === undefined && projectPageQuery.isPending;
  if (meLoading || loading || projectColdLoading) {
    return <div className={cardClass}>Loading Action Research workspace…</div>;
  }
  if (!me) {
    return <div className={cardClass}>Your account could not be loaded.</div>;
  }

  const cycle = selectedProject?.currentCycle ?? null;
  const currentProtocol = cycle?.currentProtocol ?? null;
  const projectError =
    canManage && projectPageQuery.data === undefined && projectPageQuery.isError
      ? messageOf(projectPageQuery.error)
      : null;
  const visibleError = error ?? projectError;

  return (
    <div className="space-y-6">
      {(visibleError || notice) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            visibleError
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {visibleError ?? notice}
        </div>
      )}

      {canManage && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className={cardClass}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Programme research projects</h2>
                <p className="text-sm text-slate-500">Assign an improvement problem, not a predetermined conclusion.</p>
                {projectPageQuery.data && projectPageQuery.isFetching ? (
                  <p role="status" className="mt-1 text-xs text-slate-400">Refreshing projects…</p>
                ) : null}
              </div>
              <span className="text-sm font-medium text-slate-500">{projects.length} on this page</span>
            </div>
            <div className="space-y-3">
              {projects.length === 0 && <p className="text-sm text-slate-500">No Action Research projects yet.</p>}
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => void loadSelected(project.id)}
                  className={`w-full rounded-lg border p-4 text-left transition hover:border-blue-300 ${
                    selectedProject?.id === project.id ? "border-blue-400 bg-blue-50/40" : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{project.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{project.problemStatement}</p>
                    </div>
                    <StatusPill value={project.currentCycleStatus ?? project.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{project.academicYear || "Academic year not set"}</span>
                    <span>{project.semester || "Semester not set"}</span>
                    <span>{project.assignmentCount} assignment(s)</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                disabled={previousCursors.length === 0 || projectPageQuery.isFetching}
                onClick={handlePreviousProjectPage}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!canAdvanceProjectPage}
                onClick={handleNextProjectPage}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>

          <form onSubmit={createProject} className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">New Action Research</h2>
            <p className="mb-4 text-sm text-slate-500">Start from a programme improvement problem that needs investigation.</p>
            <div className="space-y-3">
              <label>
                <span className={labelClass}>Title</span>
                <input
                  className={inputClass}
                  required
                  value={newProject.title}
                  onChange={(event) => setNewProject((value) => ({ ...value, title: event.target.value }))}
                  placeholder="Improve persistent low CLO3 achievement"
                />
              </label>
              <label>
                <span className={labelClass}>Problem statement</span>
                <textarea
                  className={`${inputClass} min-h-28`}
                  required
                  value={newProject.problemStatement}
                  onChange={(event) => setNewProject((value) => ({ ...value, problemStatement: event.target.value }))}
                  placeholder="Describe the observed programme problem and why it needs investigation."
                />
              </label>
              <label>
                <span className={labelClass}>Initial research question (optional)</span>
                <textarea
                  className={`${inputClass} min-h-20`}
                  value={newProject.researchQuestion}
                  onChange={(event) => setNewProject((value) => ({ ...value, researchQuestion: event.target.value }))}
                  placeholder="The lecturer can refine this after assignment."
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className={labelClass}>Academic year</span>
                  <input
                    className={inputClass}
                    value={newProject.academicYear}
                    onChange={(event) => setNewProject((value) => ({ ...value, academicYear: event.target.value }))}
                  />
                </label>
                <label>
                  <span className={labelClass}>Semester</span>
                  <input
                    className={inputClass}
                    value={newProject.semester}
                    onChange={(event) => setNewProject((value) => ({ ...value, semester: event.target.value }))}
                    placeholder="Semester 1"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Create research project
              </button>
            </div>
          </form>
        </section>
      )}

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">My Action Research</h2>
            <p className="text-sm text-slate-500">Assigned research, current stage, due status, and next required action.</p>
          </div>
          {myWork && (
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              {[
                ["Assigned", myWork.counts.assigned],
                ["In progress", myWork.counts.inProgress],
                ["Revision", myWork.counts.needsRevision],
                ["Review", myWork.counts.awaitingReview],
                ["Completed", myWork.counts.completed],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-md bg-slate-50 px-3 py-2">
                  <div className="text-base font-semibold text-slate-900">{value}</div>
                  <div className="text-slate-500">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {myWork?.assignments.length === 0 && (
            <p className="text-sm text-slate-500">You do not have an Action Research assignment yet.</p>
          )}
          {myWork?.assignments.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void loadSelected(item.project.id)}
              className={`rounded-lg border p-4 text-left transition hover:border-blue-300 ${
                selectedProject?.id === item.project.id ? "border-blue-400 bg-blue-50/40" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{item.project.title}</p>
                  <p className="mt-1 text-xs font-medium text-blue-700">{item.role.replaceAll("_", " ")}</p>
                </div>
                <StatusPill value={item.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600">Next: {item.nextAction}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>Stage: {item.currentStage.replaceAll("_", " ")}</span>
                {item.dueDate && <span className={item.overdue ? "font-semibold text-red-600" : ""}>Due {new Date(item.dueDate).toLocaleDateString()}</span>}
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedProject && (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className={cardClass}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-600">Selected project</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">{selectedProject.title}</h2>
                  <p className="mt-2 text-sm text-slate-600">{selectedProject.problemStatement}</p>
                </div>
                <StatusPill value={cycle?.status ?? selectedProject.status} />
              </div>
              {selectedProject.researchQuestion && (
                <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="font-medium">Initial question:</span> {selectedProject.researchQuestion}
                </div>
              )}
              {mySelectedAssignment && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusPill value={mySelectedAssignment.status} />
                  {mySelectedAssignment.status === "ASSIGNED" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void updateAssignmentStatus("ACCEPTED")}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Accept assignment
                    </button>
                  )}
                  {mySelectedAssignment.status === "ACCEPTED" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void updateAssignmentStatus("IN_PROGRESS")}
                      className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Start research
                    </button>
                  )}
                </div>
              )}
            </div>

            {canEditProtocol && cycle && (
              <form onSubmit={saveProtocol} className={cardClass}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Research protocol</h2>
                    <p className="text-sm text-slate-500">Define the question, system boundary, mechanism, evidence plan, and validity risks before intervention.</p>
                  </div>
                  {currentProtocol && <StatusPill value={`Version ${currentProtocol.version} · ${currentProtocol.status}`} />}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="md:col-span-2">
                    <span className={labelClass}>Practical problem</span>
                    <textarea className={`${inputClass} min-h-24`} required value={protocol.practicalProblem} onChange={(event) => setProtocol((value) => ({ ...value, practicalProblem: event.target.value }))} />
                  </label>
                  <label className="md:col-span-2">
                    <span className={labelClass}>Research question</span>
                    <textarea className={`${inputClass} min-h-20`} required value={protocol.researchQuestion} onChange={(event) => setProtocol((value) => ({ ...value, researchQuestion: event.target.value }))} />
                  </label>
                  <label className="md:col-span-2">
                    <span className={labelClass}>System boundary</span>
                    <textarea className={`${inputClass} min-h-20`} required value={protocol.systemBoundary} onChange={(event) => setProtocol((value) => ({ ...value, systemBoundary: event.target.value }))} placeholder="What is inside this study and what is outside?" />
                  </label>
                  <label>
                    <span className={labelClass}>Baseline pattern</span>
                    <textarea className={`${inputClass} min-h-24`} value={protocol.baselinePattern} onChange={(event) => setProtocol((value) => ({ ...value, baselinePattern: event.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Dynamic hypothesis / mechanism</span>
                    <textarea className={`${inputClass} min-h-24`} value={protocol.dynamicHypothesis} onChange={(event) => setProtocol((value) => ({ ...value, dynamicHypothesis: event.target.value }))} placeholder="How might the variables influence one another?" />
                  </label>
                  <label>
                    <span className={labelClass}>Intervention plan</span>
                    <textarea className={`${inputClass} min-h-24`} value={protocol.interventionPlan} onChange={(event) => setProtocol((value) => ({ ...value, interventionPlan: event.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Expected delay</span>
                    <textarea className={`${inputClass} min-h-24`} value={protocol.expectedDelay} onChange={(event) => setProtocol((value) => ({ ...value, expectedDelay: event.target.value }))} placeholder="When should effects become observable?" />
                  </label>
                  <label>
                    <span className={labelClass}>Primary indicators</span>
                    <textarea className={`${inputClass} min-h-20`} value={protocol.primaryIndicators} onChange={(event) => setProtocol((value) => ({ ...value, primaryIndicators: event.target.value }))} placeholder="CLO3 achievement, quiz average" />
                  </label>
                  <label>
                    <span className={labelClass}>Secondary indicators</span>
                    <textarea className={`${inputClass} min-h-20`} value={protocol.secondaryIndicators} onChange={(event) => setProtocol((value) => ({ ...value, secondaryIndicators: event.target.value }))} placeholder="Attendance, feedback" />
                  </label>
                  <label>
                    <span className={labelClass}>Success criteria</span>
                    <textarea className={`${inputClass} min-h-20`} value={protocol.successCriteria} onChange={(event) => setProtocol((value) => ({ ...value, successCriteria: event.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Comparison design</span>
                    <textarea className={`${inputClass} min-h-20`} value={protocol.comparisonDesign} onChange={(event) => setProtocol((value) => ({ ...value, comparisonDesign: event.target.value }))} placeholder="Baseline/post, previous cohort, trend…" />
                  </label>
                  <label>
                    <span className={labelClass}>Data sources</span>
                    <textarea className={`${inputClass} min-h-24`} value={protocol.dataSources} onChange={(event) => setProtocol((value) => ({ ...value, dataSources: event.target.value }))} placeholder="One source per line" />
                  </label>
                  <label>
                    <span className={labelClass}>Analysis plan</span>
                    <textarea className={`${inputClass} min-h-24`} value={protocol.analysisPlan} onChange={(event) => setProtocol((value) => ({ ...value, analysisPlan: event.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Intervention fidelity plan</span>
                    <textarea className={`${inputClass} min-h-24`} value={protocol.fidelityPlan} onChange={(event) => setProtocol((value) => ({ ...value, fidelityPlan: event.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Ethics / privacy status</span>
                    <textarea className={`${inputClass} min-h-24`} value={protocol.ethicsPrivacyStatus} onChange={(event) => setProtocol((value) => ({ ...value, ethicsPrivacyStatus: event.target.value }))} />
                  </label>
                  <label className="md:col-span-2">
                    <span className={labelClass}>Validity risks / alternative explanations</span>
                    <textarea className={`${inputClass} min-h-24`} value={protocol.validityRisks} onChange={(event) => setProtocol((value) => ({ ...value, validityRisks: event.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Planned reflection date</span>
                    <input type="date" className={inputClass} value={protocol.plannedReflectionDate} onChange={(event) => setProtocol((value) => ({ ...value, plannedReflectionDate: event.target.value }))} />
                  </label>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {(currentProtocol?.status === undefined || currentProtocol.status === "DRAFT" || currentProtocol.status === "REVISION_REQUIRED" || currentProtocol.status === "APPROVED") && (
                    <button type="submit" disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                      {currentProtocol?.status === "APPROVED" ? "Create revised version" : "Save protocol draft"}
                    </button>
                  )}
                  {currentProtocol?.status === "DRAFT" && (
                    <button type="button" disabled={busy} onClick={() => void submitProtocol()} className="rounded-md border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 disabled:opacity-50">
                      Submit for review
                    </button>
                  )}
                </div>
              </form>
            )}

            {canReview && currentProtocol?.status === "SUBMITTED" && (
              <div className={cardClass}>
                <h2 className="text-lg font-semibold text-slate-900">Protocol review</h2>
                <p className="mb-3 text-sm text-slate-500">Review the submitted protocol without changing the lecturer’s research content.</p>
                <textarea className={`${inputClass} min-h-24`} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} placeholder="Required review comment" />
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy || reviewComment.trim().length < 3} onClick={() => void reviewProtocol("APPROVE")} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                    Approve protocol
                  </button>
                  <button type="button" disabled={busy || reviewComment.trim().length < 3} onClick={() => void reviewProtocol("REQUEST_REVISION")} className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 disabled:opacity-50">
                    Request revision
                  </button>
                </div>
              </div>
            )}

            {canReview && currentProtocol?.status === "APPROVED" && !cycle?.baselineLock && (
              <form onSubmit={lockBaseline} className={cardClass}>
                <h2 className="text-lg font-semibold text-slate-900">Lock baseline</h2>
                <p className="mb-4 text-sm text-slate-500">Freeze the approved baseline definition and source provenance before intervention begins.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label><span className={labelClass}>Baseline start</span><input required type="date" className={inputClass} value={baseline.baselineStart} onChange={(event) => setBaseline((value) => ({ ...value, baselineStart: event.target.value }))} /></label>
                  <label><span className={labelClass}>Baseline end</span><input required type="date" className={inputClass} value={baseline.baselineEnd} onChange={(event) => setBaseline((value) => ({ ...value, baselineEnd: event.target.value }))} /></label>
                  <label><span className={labelClass}>Indicator key</span><input required className={inputClass} value={baseline.key} onChange={(event) => setBaseline((value) => ({ ...value, key: event.target.value }))} placeholder="clo3-achievement" /></label>
                  <label><span className={labelClass}>Indicator label</span><input required className={inputClass} value={baseline.label} onChange={(event) => setBaseline((value) => ({ ...value, label: event.target.value }))} placeholder="CLO3 Achievement" /></label>
                  <label><span className={labelClass}>Value</span><input type="number" step="any" className={inputClass} value={baseline.value} onChange={(event) => setBaseline((value) => ({ ...value, value: event.target.value }))} /></label>
                  <label><span className={labelClass}>Unit</span><input className={inputClass} value={baseline.unit} onChange={(event) => setBaseline((value) => ({ ...value, unit: event.target.value }))} /></label>
                  <label><span className={labelClass}>Denominator / n</span><input type="number" min="0" className={inputClass} value={baseline.denominator} onChange={(event) => setBaseline((value) => ({ ...value, denominator: event.target.value }))} /></label>
                  <label><span className={labelClass}>Source reference</span><input required className={inputClass} value={baseline.sourceRef} onChange={(event) => setBaseline((value) => ({ ...value, sourceRef: event.target.value }))} placeholder="PMS CLO report / semester 2" /></label>
                </div>
                <button type="submit" disabled={busy} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Lock baseline</button>
              </form>
            )}
          </div>

          <aside className="space-y-4">
            {canManage && (
              <form onSubmit={saveAssignment} className={cardClass}>
                <h2 className="text-lg font-semibold text-slate-900">Assign researcher</h2>
                <p className="mb-4 text-sm text-slate-500">Assign a lead, co-researcher, or independent reviewer.</p>
                <div className="space-y-3">
                  <label>
                    <span className={labelClass}>Staff User ID</span>
                    <input required className={inputClass} value={assignment.assigneeId} onChange={(event) => setAssignment((value) => ({ ...value, assigneeId: event.target.value }))} placeholder="Existing PMS user ID" />
                  </label>
                  <label>
                    <span className={labelClass}>Research role</span>
                    <select className={inputClass} value={assignment.role} onChange={(event) => setAssignment((value) => ({ ...value, role: event.target.value as ResearchAssignmentRole }))}>
                      <option value="LEAD_RESEARCHER">Lead researcher</option>
                      <option value="CO_RESEARCHER">Co-researcher</option>
                      <option value="REVIEWER">Reviewer</option>
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>Due date</span>
                    <input type="date" className={inputClass} value={assignment.dueDate} onChange={(event) => setAssignment((value) => ({ ...value, dueDate: event.target.value }))} />
                  </label>
                  <label>
                    <span className={labelClass}>Instructions</span>
                    <textarea className={`${inputClass} min-h-24`} value={assignment.instructions} onChange={(event) => setAssignment((value) => ({ ...value, instructions: event.target.value }))} placeholder="Investigate the problem; do not assume a predetermined conclusion." />
                  </label>
                  <button type="submit" disabled={busy} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save assignment</button>
                </div>
              </form>
            )}

            <div className={cardClass}>
              <h2 className="text-lg font-semibold text-slate-900">Research team</h2>
              <div className="mt-3 space-y-3">
                {selectedProject.assignments.length === 0 && <p className="text-sm text-slate-500">No researchers assigned yet.</p>}
                {selectedProject.assignments.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.assigneeName}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.role.replaceAll("_", " ")}</p>
                      </div>
                      <StatusPill value={item.status} />
                    </div>
                    {item.dueDate && <p className="mt-2 text-xs text-slate-500">Due {new Date(item.dueDate).toLocaleDateString()}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className={cardClass}>
              <h2 className="text-lg font-semibold text-slate-900">Cycle 1 readiness</h2>
              <dl className="mt-3 space-y-3 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Stage</dt><dd className="font-medium text-slate-800">{cycle?.status.replaceAll("_", " ") ?? "Not started"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Protocol</dt><dd className="font-medium text-slate-800">{currentProtocol ? `v${currentProtocol.version} · ${currentProtocol.status}` : "Not created"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Baseline</dt><dd className="font-medium text-slate-800">{cycle?.baselineLock ? "Locked" : "Not locked"}</dd></div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-slate-500">Observed changes are evidence to interpret, not automatic proof that an intervention caused the outcome.</p>
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}