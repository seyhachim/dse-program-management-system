"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GraduationProjectAdvisorRole, GraduationProjectPhaseKind, GraduationProjectSummary, Lecturer, OfferingView, Student } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { graduationProjectsApi } from "@/lib/graduation-projects";
import { lecturersApi } from "@/lib/lecturers";
import { offeringsApi } from "@/lib/offerings";
import { studentsApi } from "@/lib/students";

const PROGRAMME_ID = "dse";
const PHASES: GraduationProjectPhaseKind[] = ["FPR401", "FPR402", "THE402", "INT402"];

export function GraduationProjectsClient() {
  const { me, loading: meLoading } = useMe();
  const [projects, setProjects] = useState<GraduationProjectSummary[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [offerings, setOfferings] = useState<OfferingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [advisorChoice, setAdvisorChoice] = useState<Record<string, string>>({});
  const [advisorRole, setAdvisorRole] = useState<Record<string, GraduationProjectAdvisorRole>>({});
  const [phaseChoice, setPhaseChoice] = useState<Record<string, string>>({});

  const manager = me?.roles.some((role) => role === "admin" || role === "program_coordinator") ?? false;

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const rows = manager ? await graduationProjectsApi.list(PROGRAMME_ID) : await graduationProjectsApi.mine(PROGRAMME_ID);
      setProjects(rows);
      if (manager) {
        const [studentRows, lecturerRows, offeringRows] = await Promise.all([
          studentsApi.list({}), lecturersApi.list(), offeringsApi.list(),
        ]);
        setStudents(studentRows);
        setLecturers(lecturerRows);
        setOfferings(offeringRows.filter((offering) => offering.programmeYear === 4 && PHASES.includes(offering.course?.code as GraduationProjectPhaseKind)));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load final projects");
    } finally { setLoading(false); }
  }, [me, manager]);

  useEffect(() => { void load(); }, [load]);

  const activeAdvisorIds = useMemo(() => new Set(projects.flatMap((project) => project.advisors.filter((advisor) => !advisor.endedAt).map((advisor) => advisor.lecturerId))), [projects]);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || memberIds.length === 0) return;
    try {
      await graduationProjectsApi.create({ programmeId: PROGRAMME_ID, title: title.trim(), abstract: "", memberStudentIds: memberIds, leadStudentId: memberIds[0] });
      setTitle(""); setMemberIds([]); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Failed to create project"); }
  }

  async function assignAdvisor(projectId: string) {
    const lecturerId = advisorChoice[projectId];
    if (!lecturerId) return;
    try {
      await graduationProjectsApi.assignAdvisor(projectId, { lecturerId, role: advisorRole[projectId] ?? "Primary" });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Failed to assign advisor"); }
  }

  async function addPhase(projectId: string) {
    const offeringId = phaseChoice[projectId];
    const offering = offerings.find((row) => row.id === offeringId);
    const kind = offering?.course?.code as GraduationProjectPhaseKind | undefined;
    if (!offeringId || !kind || !PHASES.includes(kind)) return;
    try { await graduationProjectsApi.addPhase(projectId, { offeringId, kind, status: "Planned" }); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Failed to add project phase"); }
  }

  if (meLoading || loading) return <p className="text-sm text-muted-foreground">Loading final projects…</p>;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      {manager && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Create Year-4 project</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create the persistent project first; FPR401 and Semester-II pathway offerings are linked afterward.</p>
          <form onSubmit={createProject} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input className="rounded-md border bg-background px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" required />
            <select multiple className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm" value={memberIds} onChange={(e) => setMemberIds(Array.from(e.currentTarget.selectedOptions, (option) => option.value))}>
              {students.map((student) => <option key={student.id} value={student.id}>{student.studentId} · {student.name}</option>)}
            </select>
            <button className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" type="submit">Create</button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <div><h2 className="font-semibold">{manager ? "Programme projects" : "My advisees"}</h2><p className="text-sm text-muted-foreground">{projects.length} project{projects.length === 1 ? "" : "s"}</p></div>
        {projects.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No graduation projects are assigned yet.</div> : projects.map((project) => {
          const activeAdvisors = project.advisors.filter((advisor) => !advisor.endedAt);
          const availableOfferings = offerings.filter((offering) => !project.phases.some((phase) => phase.offeringId === offering.id));
          return (
            <article key={project.id} className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold">{project.title}</h3><p className="mt-1 text-sm text-muted-foreground">{project.members.map((member) => `${member.studentNumber} · ${member.studentName}`).join(" · ")}</p></div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{project.status}</span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Advisors</div><div className="mt-1 text-sm">{activeAdvisors.length ? activeAdvisors.map((advisor) => `${advisor.role}: ${advisor.lecturerName}`).join(" · ") : "Not assigned"}</div></div>
                <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Academic phases</div><div className="mt-1 text-sm">{project.phases.length ? project.phases.map((phase) => `${phase.kind} · ${phase.term}`).join(" → ") : "No offering linked yet"}</div></div>
              </div>
              {manager && <div className="mt-4 grid gap-3 border-t pt-4 lg:grid-cols-2">
                <div className="flex gap-2"><select className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm" value={advisorChoice[project.id] ?? ""} onChange={(e) => setAdvisorChoice((current) => ({ ...current, [project.id]: e.target.value }))}><option value="">Select advisor…</option>{lecturers.map((lecturer) => <option key={lecturer.id} value={lecturer.id}>{lecturer.name}{activeAdvisorIds.has(lecturer.id) ? " · already supervising" : ""}</option>)}</select><select className="rounded-md border bg-background px-2 text-sm" value={advisorRole[project.id] ?? "Primary"} onChange={(e) => setAdvisorRole((current) => ({ ...current, [project.id]: e.target.value as GraduationProjectAdvisorRole }))}><option value="Primary">Primary</option><option value="CoAdvisor">Co-advisor</option></select><button type="button" onClick={() => void assignAdvisor(project.id)} className="rounded-md border px-3 text-sm">Assign</button></div>
                <div className="flex gap-2"><select className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm" value={phaseChoice[project.id] ?? ""} onChange={(e) => setPhaseChoice((current) => ({ ...current, [project.id]: e.target.value }))}><option value="">Link FPR / thesis offering…</option>{availableOfferings.map((offering) => <option key={offering.id} value={offering.id}>{offering.course?.code} · {offering.term} · Class {offering.sectionCode}</option>)}</select><button type="button" onClick={() => void addPhase(project.id)} className="rounded-md border px-3 text-sm">Link phase</button></div>
              </div>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
