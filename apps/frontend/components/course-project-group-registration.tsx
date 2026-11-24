"use client";

import { useCallback, useEffect, useState } from "react";
import type { CourseProjectGroupActionInput, CourseProjectGroupPolicyInput, CourseProjectGroupProposal, CourseProjectGroupRegistrationView, CourseProjectGroupReviewInput } from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { courseProjectGroupsApi } from "@/lib/course-project-groups";

type Context = { offeringId: string; assessmentItemId: string };
const selectClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const cardClass = "space-y-3 rounded-xl border border-border bg-card p-4";
const formatDeadline = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) + " (Cambodia time)";
const cambodiaInput = (value: string) => new Date(Date.parse(value) + 7 * 3600_000).toISOString().slice(0, 16);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Could not complete group registration";
const memberName = (data: CourseProjectGroupRegistrationView, id: string) => data.classmates.find((s) => s.enrollmentId === id)?.name ?? "Unavailable classmate";

function useRegistration({ offeringId, assessmentItemId }: Context, manager: boolean) {
  const [data, setData] = useState<CourseProjectGroupRegistrationView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await courseProjectGroupsApi.get(offeringId, assessmentItemId, manager)); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setLoading(false); }
  }, [offeringId, assessmentItemId, manager]);
  useEffect(() => { void load(); }, [load]);
  const mutate = async (request: () => Promise<CourseProjectGroupRegistrationView>) => {
    setBusy(true); setError("");
    try { const next = await request(); setData(next); return next; }
    catch (reason) { setError(errorMessage(reason)); return null; }
    finally { setBusy(false); }
  };
  return { data, error, busy, loading, load, mutate };
}

export function StudentCourseProjectGroups({ offeringId, assessments }: { offeringId: string; assessments: Array<{ id: string; name: string }> }) {
  const [selected, setSelected] = useState("");
  const assessment = assessments.find((item) => item.id === selected) ?? assessments[0];
  if (!assessment) return null;
  return <div className="space-y-3">
    {assessments.length > 1 ? <label className="block text-sm font-medium">Group assessment
      <select className={selectClass} value={assessment.id} onChange={(e) => setSelected(e.target.value)}>{assessments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
    </label> : <p className="text-sm font-semibold">{assessment.name}</p>}
    <StudentProjectGroupRegistration key={`${offeringId}-${assessment.id}`} offeringId={offeringId} assessmentItemId={assessment.id} />
  </div>;
}

function StudentProjectGroupRegistration({ offeringId, assessmentItemId }: Context) {
  const { data, error, busy, loading, load, mutate } = useRegistration({ offeringId, assessmentItemId }, false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState("");
  const action = (input: CourseProjectGroupActionInput) => mutate(() => courseProjectGroupsApi.action(offeringId, assessmentItemId, input));
  if (loading && !data) return <p className="text-sm text-muted-foreground">Loading project groups…</p>;
  if (!data) return <div className={cardClass}><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={load}>Retry</Button></div>;
  const actor = data.actorEnrollmentId;
  const own = data.proposals.find((p) => p.members.some((m) => m.enrollmentId === actor && m.status === "accepted"));
  const leader = own?.leaderEnrollmentId === actor;
  const invitations = data.proposals.filter((p) => p.members.some((m) => m.enrollmentId === actor && m.status === "pending"));
  const canEdit = data.registrationOpen && !data.officialGroup && own?.status === "draft";
  const inviteCandidates = data.classmates.filter((s) => s.enrollmentId !== actor && !own?.members.some((m) => m.enrollmentId === s.enrollmentId && m.status !== "declined") && s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const acceptedCount = own?.members.filter((m) => m.status === "accepted").length ?? 0;
  const canSubmit = Boolean(own && data.policy && acceptedCount >= data.policy.minMembers && acceptedCount <= data.policy.maxMembers && own.members.every((m) => m.status !== "pending"));
  return <div className={cardClass}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold">Project groups</h3><p className="text-sm text-muted-foreground">{data.officialGroup ? "Official membership confirmed" : data.registrationOpen ? "Registration open" : data.membershipLocked ? "Academic membership locked" : "Registration is closed"}</p></div>
      <Button variant="outline" size="sm" onClick={load} disabled={busy || loading}>Refresh</Button>
    </div>
    {data.policy ? <p className="text-xs text-muted-foreground">{data.policy.minMembers}–{data.policy.maxMembers} members per group · Deadline {formatDeadline(data.policy.deadlineAt)}</p> : null}
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {data.officialGroup ? <div className="rounded-lg border border-border p-3">
      <p className="font-semibold">{data.officialGroup.name}</p>
      <p className="text-xs text-muted-foreground">Approved academic group</p>
      {data.officialGroup.members.map((m) => <p key={m.enrollmentId} className="mt-1 text-sm">{m.name}{m.enrollmentId === actor ? " (you)" : ""}</p>)}
    </div> : <>
      {own ? <div className="space-y-3 rounded-lg border border-border p-3">
        <div><p className="font-semibold">{own.name}</p><p className="text-sm text-muted-foreground">{own.status === "submitted" ? "Awaiting lecturer approval" : "Draft group"} · {acceptedCount} accepted</p></div>
        {own.reviewReason ? <p className="text-sm">Lecturer feedback: {own.reviewReason}</p> : null}
        {own.members.filter((m) => m.status !== "declined").map((m) => <div key={m.enrollmentId} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-b-0">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{memberName(data, m.enrollmentId)}{m.enrollmentId === actor ? " (you)" : ""}</p><p className="text-xs text-muted-foreground">{m.enrollmentId === own.leaderEnrollmentId ? "Leader · " : ""}{m.status}</p></div>
          {canEdit && leader && m.status === "pending" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void action({ action: "revoke", proposalId: own.id, enrollmentId: m.enrollmentId })}>Revoke</Button> : null}
        </div>)}
        {canEdit && leader ? <>
          <div className="space-y-2">
            <label className="block text-sm font-medium">Find a classmate<Input value={search} onChange={(e) => { setSearch(e.target.value); setTarget(""); }} placeholder="Search name" /></label>
            <select aria-label="Classmate to invite" className={selectClass} value={target} onChange={(e) => setTarget(e.target.value)}><option value="">Select available classmate</option>{inviteCandidates.map((s) => <option key={s.enrollmentId} value={s.enrollmentId}>{s.name}</option>)}</select>
            <Button variant="outline" disabled={busy || !target} onClick={async () => { if (await action({ action: "invite", proposalId: own.id, enrollmentId: target })) { setTarget(""); setSearch(""); } }}>Invite classmate</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !canSubmit} onClick={() => void action({ action: "submit", proposalId: own.id })}>Submit for approval</Button>
            <Button variant="outline" disabled={busy} onClick={() => { if (window.confirm("Cancel this draft group?")) void action({ action: "cancel", proposalId: own.id }); }}>Cancel group</Button>
          </div>
          {!canSubmit ? <p className="text-xs text-muted-foreground">Meet the group size and resolve pending invitations before submitting.</p> : null}
        </> : canEdit ? <Button variant="outline" disabled={busy} onClick={() => void action({ action: "withdraw", proposalId: own.id })}>Leave draft group</Button> : null}
      </div> : data.registrationOpen ? <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await action({ action: "create", name: name.trim() })) setName(""); }}>
        <label className="block text-sm font-medium">Group name<Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Group 01 — Rainfall Forecasting" /></label>
        <Button type="submit" disabled={busy || !name.trim()}>Create group</Button>
      </form> : <p className="text-sm text-muted-foreground">You do not have an official group yet. Contact your lecturer if you need help.</p>}
      {invitations.length ? <div className="space-y-2"><h4 className="text-sm font-semibold">Invitations</h4>{invitations.map((p) => <div key={p.id} className="rounded-lg border border-border p-3 space-y-2">
        <p className="text-sm font-medium">{p.name}</p><p className="text-xs text-muted-foreground">Invited by {memberName(data, p.leaderEnrollmentId)}</p>
        <div className="flex gap-2"><Button size="sm" disabled={busy || !data.registrationOpen || Boolean(own)} onClick={() => void action({ action: "accept", proposalId: p.id })}>Accept</Button><Button variant="outline" size="sm" disabled={busy || !data.registrationOpen} onClick={() => void action({ action: "decline", proposalId: p.id })}>Decline</Button></div>
      </div>)}</div> : null}
    </>}
  </div>;
}

const defaults = { enabled: false, maxGroups: "8", minMembers: "4", maxMembers: "6", deadline: "" };
function settingsFrom(policy: CourseProjectGroupPolicyInput | null) {
  return policy ? { enabled: policy.enabled, maxGroups: String(policy.maxGroups), minMembers: String(policy.minMembers), maxMembers: String(policy.maxMembers), deadline: cambodiaInput(policy.deadlineAt) } : defaults;
}
export function LecturerProjectGroupRegistration({ offeringId, assessmentItemId, onEnabledChange, onAcademicChanged }: Context & { onEnabledChange: (enabled: boolean) => void; onAcademicChanged: () => Promise<void> }) {
  const { data, error, busy, loading, load, mutate } = useRegistration({ offeringId, assessmentItemId }, true);
  const [settings, setSettings] = useState(defaults);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  useEffect(() => { if (data) { setSettings(settingsFrom(data.policy)); onEnabledChange(Boolean(data.policy?.enabled)); } }, [data, onEnabledChange]);
  const review = async (input: CourseProjectGroupReviewInput) => {
    const next = await mutate(() => courseProjectGroupsApi.review(offeringId, assessmentItemId, input));
    if (next && input.action === "approve") await onAcademicChanged();
  };
  if (loading && !data) return <p className="text-sm text-muted-foreground">Loading student group registration…</p>;
  if (!data) return <div className={cardClass}><h3 className="font-semibold">Student group registration</h3><p className="text-sm text-muted-foreground">{error}</p><Button size="sm" variant="outline" onClick={load}>Retry</Button></div>;
  const submitted = data.proposals.filter((p) => p.status === "submitted");
  const drafts = data.proposals.filter((p) => p.status === "draft");
  const pending = data.proposals.filter((p) => p.status === "draft" || p.status === "submitted").flatMap((p) => p.members.filter((m) => m.status === "pending")).length;
  const shown = [...submitted, ...drafts, ...data.proposals.filter((p) => p.status === "approved")];
  const close = async () => { if (data.policy) await mutate(() => courseProjectGroupsApi.configure(offeringId, assessmentItemId, { ...data.policy!, enabled: false })); };
  return <div className={cardClass}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold">Student group registration</h3><p className="text-sm text-muted-foreground">Students propose teams; you approve official membership.</p></div>
      <Button size="sm" variant="outline" disabled={busy || loading} onClick={load}>Refresh</Button>
    </div>
    <p className="text-sm">{data.registrationOpen ? "Registration open" : data.membershipLocked ? "Academic membership locked" : "Registration closed"} · {data.officialGroupCount} official groups · {submitted.length} awaiting review · {pending} pending invitations · {data.unassignedCount} unassigned</p>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    {!data.membershipLocked ? <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await mutate(() => courseProjectGroupsApi.configure(offeringId, assessmentItemId, { enabled: settings.enabled, maxGroups: Number(settings.maxGroups), minMembers: Number(settings.minMembers), maxMembers: Number(settings.maxMembers), deadlineAt: settings.deadline + ":00+07:00" })); }}>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))} /> Enable student registration</label>
      <div className="grid gap-2 sm:grid-cols-3">
        {([{ key: "maxGroups", label: "Maximum groups", min: 1, max: 100 }, { key: "minMembers", label: "Minimum members", min: 2, max: 30 }, { key: "maxMembers", label: "Maximum members", min: 2, max: 30 }] as const).map((f) => <label key={f.key} className="text-sm font-medium">{f.label}<Input type="number" required min={f.min} max={f.max} value={settings[f.key]} onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))} /></label>)}
      </div>
      <label className="block text-sm font-medium">Deadline (Cambodia time)<Input type="datetime-local" required value={settings.deadline} onChange={(e) => setSettings((s) => ({ ...s, deadline: e.target.value }))} /></label>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Save registration settings</Button>{data.policy?.enabled ? <Button type="button" variant="outline" disabled={busy} onClick={() => { if (window.confirm("Close registration before manual membership changes?")) void close(); }}>Close registration</Button> : null}</div>
    </form> : data.policy?.enabled ? <Button variant="outline" disabled={busy} onClick={() => void close()}>Close registration</Button> : null}
    {shown.map((p) => <div key={p.id} className="rounded-lg border border-border p-3 space-y-2">
      <p className="font-semibold">{p.name} <span className="text-xs font-normal text-muted-foreground">· {p.status}</span></p>
      <ProposalMembers data={data} proposal={p} />
      {p.reviewReason ? <p className="text-xs text-muted-foreground">Feedback: {p.reviewReason}</p> : null}
      {!data.membershipLocked && p.status !== "approved" ? <>
        <label className="block text-sm">Reason (return or cancel)<Input value={reviewReasons[p.id] ?? ""} maxLength={500} onChange={(e) => setReviewReasons((v) => ({ ...v, [p.id]: e.target.value }))} /></label>
        <div className="flex flex-wrap gap-2">
          {p.status === "submitted" ? <>
            <Button size="sm" disabled={busy || !data.policy?.enabled} onClick={() => { if (window.confirm("Approve this team's official assessment membership?")) void review({ action: "approve", proposalId: p.id }); }}>Approve group</Button>
            <Button size="sm" variant="outline" disabled={busy || !data.policy?.enabled || !reviewReasons[p.id]?.trim()} onClick={() => void review({ action: "return", proposalId: p.id, reason: reviewReasons[p.id]!.trim() })}>Return for changes</Button>
          </> : null}
          <Button size="sm" variant="outline" disabled={busy || !reviewReasons[p.id]?.trim()} onClick={() => { if (window.confirm("Cancel this proposal? No academic membership will be changed.")) void review({ action: "cancel", proposalId: p.id, reason: reviewReasons[p.id]!.trim() }); }}>Cancel proposal</Button>
        </div>
      </> : null}
    </div>)}
    {data.unassignedEnrollmentIds.length ? <details><summary className="cursor-pointer text-sm font-medium">Unassigned students ({data.unassignedCount})</summary><div className="mt-2 grid gap-1 sm:grid-cols-2">{data.unassignedEnrollmentIds.map((id) => <p key={id} className="text-sm">{memberName(data, id)}</p>)}</div></details> : null}
  </div>;
}
function ProposalMembers({ data, proposal }: { data: CourseProjectGroupRegistrationView; proposal: CourseProjectGroupProposal }) {
  return <div className="space-y-1">{proposal.members.map((m) => <p key={m.enrollmentId} className="text-sm">{memberName(data, m.enrollmentId)} <span className="text-xs text-muted-foreground">· {m.enrollmentId === proposal.leaderEnrollmentId ? "Leader · " : ""}{m.status}</span></p>)}</div>;
}
