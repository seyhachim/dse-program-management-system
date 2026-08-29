"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  MyActionResearchView,
  ResearchInterventionStatus,
  ResearchInterventionView,
  ResearchProjectView,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const PROGRAMME_ID = "dse";
const cardClass = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500";
const buttonClass =
  "rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

interface ProjectChoice {
  id: string;
  title: string;
  academicYear: string;
  semester: string;
  stage: string;
}

interface PlanState {
  title: string;
  description: string;
  target: string;
  responsibleResearcherIds: string[];
  plannedStart: string;
  plannedEnd: string;
  expectedEffect: string;
  expectedDelay: string;
}

interface FidelityState {
  occurredAt: string;
  plannedDosage: string;
  deliveredDosage: string;
  reachCount: string;
  reachDenominator: string;
  reachNote: string;
  deviation: string;
  deviationReason: string;
  contextualEvents: string;
  lecturerObservation: string;
  evidenceRefs: string;
}

const emptyPlan: PlanState = {
  title: "",
  description: "",
  target: "",
  responsibleResearcherIds: [],
  plannedStart: "",
  plannedEnd: "",
  expectedEffect: "",
  expectedDelay: "",
};

const emptyFidelity: FidelityState = {
  occurredAt: "",
  plannedDosage: "",
  deliveredDosage: "",
  reachCount: "",
  reachDenominator: "",
  reachNote: "",
  deviation: "",
  deviationReason: "",
  contextualEvents: "",
  lecturerObservation: "",
  evidenceRefs: "",
};

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

function splitRefs(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function datetimeLocal(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700">
      {value.replaceAll("_", " ").toLowerCase()}
    </span>
  );
}

function Flag({ children, tone = "amber" }: { children: React.ReactNode; tone?: "amber" | "red" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        tone === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {children}
    </span>
  );
}

export function InterventionsClient() {
  const { me, loading: meLoading } = useMe();
  const [choices, setChoices] = useState<ProjectChoice[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [project, setProject] = useState<ResearchProjectView | null>(null);
  const [interventions, setInterventions] = useState<ResearchInterventionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanState>(emptyPlan);
  const [fidelity, setFidelity] = useState<FidelityState>(emptyFidelity);

  const roles = me?.roles ?? [];
  const isManager = roles.some((role) => role === "admin" || role === "program_coordinator");

  const loadChoices = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const [mine, managed] = await Promise.all([
        api.get<MyActionResearchView>(
          `/api/qa/action-research/my-work?programmeId=${encodeURIComponent(PROGRAMME_ID)}`,
        ),
        isManager
          ? api.get<ResearchProjectView[]>(
              `/api/qa/action-research/projects?programmeId=${encodeURIComponent(PROGRAMME_ID)}`,
            )
          : Promise.resolve([]),
      ]);

      const byId = new Map<string, ProjectChoice>();
      for (const assignment of mine.assignments) {
        byId.set(assignment.project.id, {
          id: assignment.project.id,
          title: assignment.project.title,
          academicYear: assignment.project.academicYear,
          semester: assignment.project.semester,
          stage: assignment.currentStage,
        });
      }
      for (const item of managed) {
        byId.set(item.id, {
          id: item.id,
          title: item.title,
          academicYear: item.academicYear,
          semester: item.semester,
          stage: item.currentCycle?.status ?? item.status,
        });
      }
      const next = [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
      setChoices(next);
      setSelectedProjectId((current) => current || next[0]?.id || "");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [isManager, me]);

  const loadProject = useCallback(async (projectId: string) => {
    if (!projectId) {
      setProject(null);
      setInterventions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detail = await api.get<ResearchProjectView>(
        `/api/qa/action-research/projects/${projectId}?programmeId=${encodeURIComponent(PROGRAMME_ID)}`,
      );
      setProject(detail);
      const cycleId = detail.currentCycle?.id;
      if (!cycleId) {
        setInterventions([]);
        return;
      }
      const timeline = await api.get<ResearchInterventionView[]>(
        `/api/qa/action-research/cycles/${cycleId}/interventions?programmeId=${encodeURIComponent(PROGRAMME_ID)}`,
      );
      setInterventions(timeline);
    } catch (err) {
      setError(messageOf(err));
      setProject(null);
      setInterventions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!meLoading && me) void loadChoices();
  }, [loadChoices, me, meLoading]);

  useEffect(() => {
    if (selectedProjectId) void loadProject(selectedProjectId);
  }, [loadProject, selectedProjectId]);

  const myResearchAssignment = useMemo(
    () => project?.assignments.find(
      (assignment) =>
        assignment.assigneeId === me?.id
        && (assignment.role === "LEAD_RESEARCHER" || assignment.role === "CO_RESEARCHER"),
    ),
    [me?.id, project],
  );
  const canEdit = Boolean(myResearchAssignment);
  const cycle = project?.currentCycle ?? null;
  const canPlan = canEdit && (cycle?.status === "BASELINE_LOCKED" || cycle?.status === "INTERVENTION_ACTIVE");

  const eligibleResearchers = useMemo(() => {
    if (!project) return [];
    const byUser = new Map<string, { id: string; name: string }>();
    for (const assignment of project.assignments) {
      if (assignment.role === "LEAD_RESEARCHER" || assignment.role === "CO_RESEARCHER") {
        byUser.set(assignment.assigneeId, { id: assignment.assigneeId, name: assignment.assigneeName });
      }
    }
    return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [project]);

  async function refresh() {
    if (selectedProjectId) await loadProject(selectedProjectId);
  }

  async function runAction(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await refresh();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  function resetPlan() {
    setEditingId(null);
    setPlan({
      ...emptyPlan,
      responsibleResearcherIds: myResearchAssignment ? [myResearchAssignment.assigneeId] : [],
    });
  }

  function toggleResearcher(userId: string) {
    setPlan((current) => ({
      ...current,
      responsibleResearcherIds: current.responsibleResearcherIds.includes(userId)
        ? current.responsibleResearcherIds.filter((id) => id !== userId)
        : [...current.responsibleResearcherIds, userId],
    }));
  }

  function editIntervention(item: ResearchInterventionView) {
    setEditingId(item.id);
    setPlan({
      title: item.title,
      description: item.description,
      target: item.target,
      responsibleResearcherIds: item.responsibleResearchers.map((researcher) => researcher.userId),
      plannedStart: datetimeLocal(item.plannedStart),
      plannedEnd: datetimeLocal(item.plannedEnd),
      expectedEffect: item.expectedEffect,
      expectedDelay: item.expectedDelay,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    const cycleId = cycle?.id;
    if (!cycleId) return;
    const payload = {
      programmeId: PROGRAMME_ID,
      ...plan,
      plannedStart: new Date(plan.plannedStart).toISOString(),
      plannedEnd: new Date(plan.plannedEnd).toISOString(),
    };
    await runAction(async () => {
      if (editingId) {
        await api.put(`/api/qa/action-research/interventions/${editingId}`, payload);
      } else {
        await api.post(`/api/qa/action-research/cycles/${cycleId}/interventions`, payload);
      }
      resetPlan();
    }, editingId ? "Intervention plan updated with a new audit version." : "Intervention planned.");
  }

  async function updateStatus(item: ResearchInterventionView, status: ResearchInterventionStatus) {
    await runAction(async () => {
      await api.patch(`/api/qa/action-research/interventions/${item.id}/status`, {
        programmeId: PROGRAMME_ID,
        status,
      });
      setLoggingId(null);
      setFidelity(emptyFidelity);
    }, status === "ACTIVE" ? "Intervention started." : status === "COMPLETED" ? "Intervention completed." : "Intervention cancelled.");
  }

  function startFidelity(item: ResearchInterventionView) {
    setLoggingId(item.id);
    setFidelity({
      ...emptyFidelity,
      occurredAt: datetimeLocal(new Date().toISOString()),
    });
  }

  async function saveFidelity(event: FormEvent) {
    event.preventDefault();
    if (!loggingId) return;
    await runAction(async () => {
      await api.post(`/api/qa/action-research/interventions/${loggingId}/logs`, {
        programmeId: PROGRAMME_ID,
        occurredAt: new Date(fidelity.occurredAt).toISOString(),
        plannedDosage: fidelity.plannedDosage,
        deliveredDosage: fidelity.deliveredDosage,
        reachCount: fidelity.reachCount === "" ? null : Number(fidelity.reachCount),
        reachDenominator: fidelity.reachDenominator === "" ? null : Number(fidelity.reachDenominator),
        reachNote: fidelity.reachNote,
        deviation: fidelity.deviation,
        deviationReason: fidelity.deviationReason,
        contextualEvents: fidelity.contextualEvents,
        lecturerObservation: fidelity.lecturerObservation,
        evidenceRefs: splitRefs(fidelity.evidenceRefs),
      });
      setLoggingId(null);
      setFidelity(emptyFidelity);
    }, "Fidelity observation recorded without changing the approved protocol.");
  }

  if (meLoading || (loading && choices.length === 0)) {
    return <div className={cardClass}>Loading intervention workspace…</div>;
  }
  if (!me) return <div className={cardClass}>Your account could not be loaded.</div>;

  return (
    <div className="space-y-5">
      {(error || notice) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ?? notice}
        </div>
      )}

      <section className={cardClass}>
        <label>
          <span className={labelClass}>Research project</span>
          <select
            className={inputClass}
            value={selectedProjectId}
            onChange={(event) => {
              setSelectedProjectId(event.target.value);
              setEditingId(null);
              setLoggingId(null);
              setNotice(null);
            }}
          >
            {choices.length === 0 && <option value="">No accessible Action Research projects</option>}
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.title} · {choice.academicYear || "year not set"} · {choice.stage.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        {project && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-medium text-slate-900">{project.title}</span>
            <StatusPill value={cycle?.status ?? project.status} />
            {project.semester && <span>{project.semester}</span>}
          </div>
        )}
      </section>

      {project && !cycle?.baselineLock && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The approved protocol must have its baseline locked before an intervention can be planned. This keeps the pre-intervention comparison immutable.
        </section>
      )}

      {project && canPlan && (
        <form onSubmit={savePlan} className={cardClass}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId ? "Edit planned intervention" : "Plan an intervention"}
              </h2>
              <p className="text-sm text-slate-500">
                Planned fields stay separate from later delivery logs. Editing a planned intervention increments its audit version.
              </p>
            </div>
            {editingId && (
              <button type="button" className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={resetPlan}>
                Cancel edit
              </button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className={labelClass}>Title</span>
              <input className={inputClass} required minLength={3} value={plan.title} onChange={(event) => setPlan((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>
              <span className={labelClass}>Target</span>
              <input className={inputClass} required minLength={3} value={plan.target} onChange={(event) => setPlan((current) => ({ ...current, target: event.target.value }))} placeholder="CLO3 achievement / attendance / submission behaviour" />
            </label>
            <label className="md:col-span-2">
              <span className={labelClass}>Description</span>
              <textarea className={inputClass} rows={3} value={plan.description} onChange={(event) => setPlan((current) => ({ ...current, description: event.target.value }))} />
            </label>
            <label>
              <span className={labelClass}>Planned start</span>
              <input className={inputClass} required type="datetime-local" value={plan.plannedStart} onChange={(event) => setPlan((current) => ({ ...current, plannedStart: event.target.value }))} />
            </label>
            <label>
              <span className={labelClass}>Planned end</span>
              <input className={inputClass} required type="datetime-local" value={plan.plannedEnd} onChange={(event) => setPlan((current) => ({ ...current, plannedEnd: event.target.value }))} />
            </label>
            <label>
              <span className={labelClass}>Expected effect</span>
              <textarea className={inputClass} rows={3} value={plan.expectedEffect} onChange={(event) => setPlan((current) => ({ ...current, expectedEffect: event.target.value }))} />
            </label>
            <label>
              <span className={labelClass}>Expected delay</span>
              <textarea className={inputClass} rows={3} value={plan.expectedDelay} onChange={(event) => setPlan((current) => ({ ...current, expectedDelay: event.target.value }))} placeholder="Example: effect may become visible after one teaching week" />
            </label>
          </div>
          <fieldset className="mt-4 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-slate-500">Responsible researchers</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {eligibleResearchers.map((researcher) => (
                <label key={researcher.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={plan.responsibleResearcherIds.includes(researcher.id)}
                    onChange={() => toggleResearcher(researcher.id)}
                  />
                  {researcher.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={busy || plan.responsibleResearcherIds.length === 0}
            className={`${buttonClass} mt-4 bg-blue-700 text-white hover:bg-blue-800`}
          >
            {editingId ? "Save new plan version" : "Create intervention"}
          </button>
        </form>
      )}

      {project && !canEdit && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Read-only fidelity review. Only assigned Lead/Co researchers can change intervention plans or delivery records.
        </section>
      )}

      <section className={cardClass}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Planned vs actual timeline</h2>
            <p className="text-sm text-slate-500">Each actual entry is append-only and retains its author, time, evidence references, and the plan version it was logged against in the audit trail.</p>
          </div>
          <span className="text-sm font-medium text-slate-500">{interventions.length} intervention(s)</span>
        </div>

        {interventions.length === 0 && (
          <p className="text-sm text-slate-500">No interventions have been planned for this cycle.</p>
        )}

        <div className="space-y-5">
          {interventions.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">{item.title}</h3>
                    <StatusPill value={item.status} />
                    <span className="text-xs text-slate-500">plan v{item.version}</span>
                    {item.delayed && <Flag>Delayed</Flag>}
                    {item.missed && <Flag tone="red">Missed</Flag>}
                    {item.hasDeviation && <Flag>Deviation recorded</Flag>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{item.target}</p>
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {item.status === "PLANNED" && (
                      <>
                        <button type="button" disabled={busy} className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => editIntervention(item)}>Edit plan</button>
                        <button type="button" disabled={busy} className={`${buttonClass} bg-blue-700 text-white`} onClick={() => void updateStatus(item, "ACTIVE")}>Start</button>
                        <button type="button" disabled={busy} className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => void updateStatus(item, "CANCELLED")}>Cancel</button>
                      </>
                    )}
                    {item.status === "ACTIVE" && (
                      <>
                        <button type="button" disabled={busy} className={`${buttonClass} bg-blue-50 text-blue-700`} onClick={() => startFidelity(item)}>Add actual delivery</button>
                        <button type="button" disabled={busy} className={`${buttonClass} bg-emerald-700 text-white`} onClick={() => void updateStatus(item, "COMPLETED")}>Complete</button>
                        <button type="button" disabled={busy} className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => void updateStatus(item, "CANCELLED")}>Cancel</button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 rounded-lg bg-blue-50/60 p-3 text-sm md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Planned</p>
                  <p className="mt-1 text-slate-700">{formatDate(item.plannedStart)} → {formatDate(item.plannedEnd)}</p>
                  {item.description && <p className="mt-2 text-slate-600">{item.description}</p>}
                </div>
                <div>
                  <p><span className="font-medium text-slate-700">Expected effect:</span> {item.expectedEffect || "Not recorded"}</p>
                  <p className="mt-1"><span className="font-medium text-slate-700">Expected delay:</span> {item.expectedDelay || "Not recorded"}</p>
                  <p className="mt-1"><span className="font-medium text-slate-700">Responsible:</span> {item.responsibleResearchers.map((researcher) => researcher.name).join(", ")}</p>
                </div>
              </div>

              {loggingId === item.id && (
                <form onSubmit={saveFidelity} className="mt-4 rounded-lg border border-blue-200 bg-blue-50/30 p-4">
                  <h4 className="font-medium text-slate-900">Record actual delivery / observation</h4>
                  <p className="mt-1 text-sm text-slate-500">This creates an append-only fidelity record; it does not rewrite the approved protocol or locked baseline.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label>
                      <span className={labelClass}>Occurred at</span>
                      <input className={inputClass} required type="datetime-local" value={fidelity.occurredAt} onChange={(event) => setFidelity((current) => ({ ...current, occurredAt: event.target.value }))} />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label>
                        <span className={labelClass}>Reach count</span>
                        <input className={inputClass} min={0} type="number" value={fidelity.reachCount} onChange={(event) => setFidelity((current) => ({ ...current, reachCount: event.target.value }))} />
                      </label>
                      <label>
                        <span className={labelClass}>Denominator</span>
                        <input className={inputClass} min={1} type="number" value={fidelity.reachDenominator} onChange={(event) => setFidelity((current) => ({ ...current, reachDenominator: event.target.value }))} />
                      </label>
                    </div>
                    <label>
                      <span className={labelClass}>Planned dosage</span>
                      <textarea className={inputClass} rows={2} value={fidelity.plannedDosage} onChange={(event) => setFidelity((current) => ({ ...current, plannedDosage: event.target.value }))} />
                    </label>
                    <label>
                      <span className={labelClass}>Delivered dosage</span>
                      <textarea className={inputClass} rows={2} value={fidelity.deliveredDosage} onChange={(event) => setFidelity((current) => ({ ...current, deliveredDosage: event.target.value }))} />
                    </label>
                    <label>
                      <span className={labelClass}>Reach note</span>
                      <textarea className={inputClass} rows={2} value={fidelity.reachNote} onChange={(event) => setFidelity((current) => ({ ...current, reachNote: event.target.value }))} />
                    </label>
                    <label>
                      <span className={labelClass}>Deviation</span>
                      <textarea className={inputClass} rows={2} value={fidelity.deviation} onChange={(event) => setFidelity((current) => ({ ...current, deviation: event.target.value }))} />
                    </label>
                    <label>
                      <span className={labelClass}>Deviation reason</span>
                      <textarea className={inputClass} rows={2} value={fidelity.deviationReason} onChange={(event) => setFidelity((current) => ({ ...current, deviationReason: event.target.value }))} />
                    </label>
                    <label>
                      <span className={labelClass}>Contextual events</span>
                      <textarea className={inputClass} rows={2} value={fidelity.contextualEvents} onChange={(event) => setFidelity((current) => ({ ...current, contextualEvents: event.target.value }))} />
                    </label>
                    <label className="md:col-span-2">
                      <span className={labelClass}>Lecturer observation</span>
                      <textarea className={inputClass} rows={3} value={fidelity.lecturerObservation} onChange={(event) => setFidelity((current) => ({ ...current, lecturerObservation: event.target.value }))} />
                    </label>
                    <label className="md:col-span-2">
                      <span className={labelClass}>Evidence references</span>
                      <textarea className={inputClass} rows={2} value={fidelity.evidenceRefs} onChange={(event) => setFidelity((current) => ({ ...current, evidenceRefs: event.target.value }))} placeholder="One evidence reference per line; Evidence Binder adapters are Phase 5" />
                    </label>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="submit" disabled={busy} className={`${buttonClass} bg-blue-700 text-white`}>Save actual delivery</button>
                    <button type="button" disabled={busy} className={`${buttonClass} bg-slate-100 text-slate-700`} onClick={() => { setLoggingId(null); setFidelity(emptyFidelity); }}>Cancel</button>
                  </div>
                </form>
              )}

              <div className="mt-4 border-l-2 border-slate-200 pl-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Actual delivery & observations</p>
                {item.logs.length === 0 && <p className="text-sm text-slate-500">No actual-delivery record yet.</p>}
                <div className="space-y-4">
                  {item.logs.map((log) => (
                    <div key={log.id} className="relative rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-slate-900">{formatDate(log.occurredAt)}</p>
                        <p className="text-xs text-slate-500">Recorded by {log.authorName} · {formatDate(log.createdAt)}</p>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-md bg-slate-50 p-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Planned dosage</p>
                          <p className="mt-1 text-slate-700">{log.plannedDosage || "Not specified"}</p>
                        </div>
                        <div className="rounded-md bg-emerald-50/60 p-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Actually delivered</p>
                          <p className="mt-1 text-slate-700">{log.deliveredDosage || "Not specified"}</p>
                        </div>
                      </div>
                      {(log.reachCount !== null || log.reachNote) && (
                        <p className="mt-2 text-slate-600">
                          <span className="font-medium text-slate-700">Reach:</span>{" "}
                          {log.reachCount !== null ? `${log.reachCount}${log.reachDenominator !== null ? ` / ${log.reachDenominator}` : ""}` : "Not quantified"}
                          {log.reachNote ? ` · ${log.reachNote}` : ""}
                        </p>
                      )}
                      {log.deviation && <p className="mt-2 text-amber-800"><span className="font-medium">Deviation:</span> {log.deviation}</p>}
                      {log.deviationReason && <p className="mt-1 text-amber-800"><span className="font-medium">Reason:</span> {log.deviationReason}</p>}
                      {log.contextualEvents && <p className="mt-2 text-slate-600"><span className="font-medium text-slate-700">Context:</span> {log.contextualEvents}</p>}
                      {log.lecturerObservation && <p className="mt-2 text-slate-600"><span className="font-medium text-slate-700">Observation:</span> {log.lecturerObservation}</p>}
                      {log.evidenceRefs.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evidence references</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {log.evidenceRefs.map((reference) => (
                              <span key={reference} className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{reference}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
