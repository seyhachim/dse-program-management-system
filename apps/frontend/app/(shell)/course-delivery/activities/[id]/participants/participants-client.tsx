"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CreateVisitParticipantInput, VisitParticipantView, VisitParticipantsWorkspace } from "@dse-pms/shared-types";
import { visitParticipantsApi } from "@/lib/activity-publications";

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-10";
const CHECKPOINTS = ["Unknown", "Marked", "NotMarked"] as const;
const SOURCES = ["PaperTripSheet", "Manual", "HostVerified"] as const;
const FARMS = ["Unverified", "Confirmed", "NotAttended"] as const;
const TYPES = ["Staff", "Assistant", "Guest", "Other"] as const;

export function ParticipantsClient({ offeringId, activityId }: { offeringId: string; activityId: string }) {
  const [workspace, setWorkspace] = useState<VisitParticipantsWorkspace | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalRole, setExternalRole] = useState<typeof TYPES[number]>("Staff");
  const [source, setSource] = useState<typeof SOURCES[number]>("PaperTripSheet");
  const [goStatus, setGoStatus] = useState<typeof CHECKPOINTS[number]>("Unknown");
  const [returnStatus, setReturnStatus] = useState<typeof CHECKPOINTS[number]>("Unknown");
  const [mode, setMode] = useState<"student" | "external">("student");
  const load = useCallback(async () => {
    if (!activityId) return;
    try { setWorkspace(await visitParticipantsApi.list(offeringId, activityId)); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load visit records"); }
  }, [offeringId, activityId]);
  useEffect(() => { void load(); }, [load]);

  const recordedStudents = new Set(workspace?.participants.map(p => p.studentId).filter(Boolean) ?? []);
  const availableStudents = workspace?.roster.filter(s => !recordedStudents.has(s.id)) ?? [];
  const byStudent = new Map((workspace?.participants ?? []).filter(p => p.studentId).map(p => [p.studentId!, p]));

  async function add() {
    setSaving(true); setError(""); setNotice("");
    try {
      const input: CreateVisitParticipantInput = {
        ...(mode === "student" ? { studentId } : { externalName: externalName.trim(), externalRole }),
        source, goStatus, returnStatus, farmStatus: "Unverified", note: "",
      };
      await visitParticipantsApi.add(offeringId, activityId, input);
      await load();
      setStudentId(""); setExternalName("");
      setNotice("Visit record saved. Farm attendance remains unverified.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save participant"); }
    finally { setSaving(false); }
  }
  async function update(p: VisitParticipantView, changes: {
    goStatus?: typeof CHECKPOINTS[number]; returnStatus?: typeof CHECKPOINTS[number];
    farmStatus?: typeof FARMS[number]; source?: typeof SOURCES[number];
  }) {
    setSaving(true); setError(""); setNotice("");
    try {
      await visitParticipantsApi.update(offeringId, activityId, p.id, {
        expectedVersion: p.version, ...changes,
      });
      await load();
      setNotice("Participation record updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update record"); }
    finally { setSaving(false); }
  }
  const row = (p: VisitParticipantView | undefined, name: string, key: string) => (
    <div key={key} className="grid gap-3 border-t border-border py-3 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_minmax(0,0.9fr)] md:items-center">
      <div>
        <p className="break-words text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">{p ? p.source.replaceAll(/([A-Z])/g, " $1").trim() : "Not documented on this sheet"}</p>
      </div>
      {p ? (
        <>
          <label className="space-y-1 text-xs">Go
            <select disabled={saving} className={FIELD} value={p.goStatus} onChange={(e) => { void update(p, { goStatus: e.target.value as typeof CHECKPOINTS[number] }); }}>
              {CHECKPOINTS.map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">Return
            <select disabled={saving} className={FIELD} value={p.returnStatus} onChange={(e) => { void update(p, { returnStatus: e.target.value as typeof CHECKPOINTS[number] }); }}>
              {CHECKPOINTS.map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs">At Sindora
            <select disabled={saving} className={FIELD} value={p.farmStatus} onChange={(e) => {
              const value = e.target.value as typeof FARMS[number];
              void update(p, { farmStatus: value, ...(value === "Confirmed" ? { source: "HostVerified" as const } : {}) });
            }}>
              {FARMS.map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <span className="text-xs text-muted-foreground">Revision {p.version}</span>
        </>
      ) : <p className="text-xs text-muted-foreground md:col-span-4">No trip-sheet entry recorded. Do not mark this student absent automatically.</p>}
    </div>
  );

  const participants = workspace?.participants ?? [];
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={"/course-delivery/activities/" + offeringId} className="text-sm text-primary underline">← Course activities</Link>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="font-semibold">Private participation record</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Go/Return marks on the Kampot trip sheet are not proof of farm attendance. This list is visible only to authorized teaching staff.
          No phone numbers or signatures are stored here. This does not affect class absence counts.
        </p>
      </div>
      {notice && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {!activityId && <p role="alert">Select a Course Activity first.</p>}
      {workspace && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-4"><p className="text-2xl font-semibold">{participants.length}</p><p className="text-xs text-muted-foreground">Recorded trip entries</p></div>
            <div className="rounded-xl border p-4"><p className="text-2xl font-semibold">{participants.filter(p => p.farmStatus === "Confirmed").length}</p><p className="text-xs text-muted-foreground">Confirmed at farm</p></div>
            <div className="rounded-xl border p-4"><p className="text-2xl font-semibold">{availableStudents.length}</p><p className="text-xs text-muted-foreground">Enrolled but not recorded</p></div>
          </div>
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">Add participant</h2>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={mode === "student"} onChange={() => setMode("student")} /> Enrolled student</label>
              <label className="flex items-center gap-2"><input type="radio" checked={mode === "external"} onChange={() => setMode("external")} /> Staff / assistant / guest</label>
            </div>
            {mode === "student" ? (
              <label className="block space-y-1 text-sm">Student from AIE401 roster
                <select className={FIELD} value={studentId} onChange={e => setStudentId(e.target.value)}>
                  <option value="">Choose a student</option>
                  {availableStudents.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            ) : <div className="grid gap-2 sm:grid-cols-2">
              <label className="space-y-1 text-sm">Name
                <input className={FIELD} maxLength={160} value={externalName} onChange={e => setExternalName(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">Role
                <select className={FIELD} value={externalRole} onChange={e => setExternalRole(e.target.value as typeof TYPES[number])}>
                  {TYPES.map(x => <option key={x}>{x}</option>)}
                </select>
              </label>
            </div>}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm">Source
                <select className={FIELD} value={source} onChange={e => setSource(e.target.value as typeof SOURCES[number])}>
                  <option value="PaperTripSheet">Paper trip sheet</option><option value="Manual">Manual</option><option value="HostVerified">Host verified</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">Departure / Go
                <select className={FIELD} value={goStatus} onChange={e => setGoStatus(e.target.value as typeof CHECKPOINTS[number])}>
                  {CHECKPOINTS.map(x => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm">Return
                <select className={FIELD} value={returnStatus} onChange={e => setReturnStatus(e.target.value as typeof CHECKPOINTS[number])}>
                  {CHECKPOINTS.map(x => <option key={x}>{x}</option>)}
                </select>
              </label>
            </div>
            <button disabled={saving || (mode === "student" ? !studentId : externalName.trim().length < 2)} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => { void add(); }} type="button">
              {saving ? "Saving…" : "Save trip participant"}
            </button>
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold">Enrolled AIE401 students</h2>
            {workspace.roster.map(s => row(byStudent.get(s.id), s.name, s.id))}
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold">External participants (staff / assistants / guests)</h2>
            {participants.filter(p => !p.studentId).length === 0 && <p className="text-sm text-muted-foreground">No external participants recorded.</p>}
            {participants.filter(p => !p.studentId).map(p => row(p, p.externalName ?? "Unnamed external", p.id))}
          </section>
        </>
      )}
    </div>
  );
}
