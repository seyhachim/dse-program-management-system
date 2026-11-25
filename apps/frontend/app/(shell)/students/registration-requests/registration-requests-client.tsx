"use client";

import { useEffect, useState, useRef } from "react";
import type { TelegramRegistrationStaffRow, TelegramRegistrationStatus, TelegramRegistrationReviewInput, TelegramRegistrationRosterCandidate } from "@dse-pms/shared-types";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";

const root = "/api/telegram/registration/staff/requests";
const filters: TelegramRegistrationStatus[] = ["PENDING", "NEEDS_CORRECTION", "APPROVED", "REJECTED"];
const labels = { PENDING: "Pending", NEEDS_CORRECTION: "Needs correction", APPROVED: "Approved", REJECTED: "Rejected" };
const field = "rounded-md border border-input bg-background px-3 py-2 text-sm";
const button = "rounded-md border border-input bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50";

export function RegistrationRequestsClient() {
  const { me, loading } = useMe();
  const allowed = Boolean(me?.roles.some(role => role === "admin" || role === "program_coordinator"));
  const [status,setStatus] = useState<TelegramRegistrationStatus>("PENDING");
  const [offset,setOffset] = useState(0);
  const [rows,setRows] = useState<TelegramRegistrationStaffRow[]>([]);
  const [more,setMore] = useState(false);
  const [selected,setSelected] = useState<TelegramRegistrationStaffRow | null>(null);
  const [candidates,setCandidates] = useState<TelegramRegistrationRosterCandidate[]>([]);
  const [search,setSearch] = useState("");
  const [studentId,setStudentId] = useState("");
  const [confirmed,setConfirmed] = useState(false);
  const [reason,setReason] = useState("");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [fetching,setFetching] = useState(false);
  const [candidateLoading,setCandidateLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const [revision,setRevision] = useState(0);
  const candidateSequence = useRef(0);
  const savingRef = useRef(false);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setFetching(true); setRows([]); setMore(false); setError("");
    void api.get<{items: TelegramRegistrationStaffRow[]; hasMore: boolean}>(`${root}?status=${status}&offset=${offset}`)
      .then(result => { if (active) { setRows(result.items); setMore(result.hasMore); } })
      .catch(() => { if (active) setError("Unable to load requests. Verify your programme permissions."); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [allowed,status,offset,revision,me?.id]);
  function resetSelection() { candidateSequence.current++; setCandidateLoading(false); setSelected(null); setCandidates([]); setStudentId(""); setConfirmed(false); setReason(""); setSearch(""); }
  async function findCandidates(row: TelegramRegistrationStaffRow, term: string) {
    const sequence = ++candidateSequence.current;
    setCandidateLoading(true); setCandidates([]); setStudentId(""); setConfirmed(false); setError("");
    try {
      const result = await api.get<TelegramRegistrationRosterCandidate[]>(`${root}/${encodeURIComponent(row.id)}/candidates?search=${encodeURIComponent(term)}`);
      if (sequence === candidateSequence.current) setCandidates(result);
    } catch { if (sequence === candidateSequence.current) setError("Could not load roster candidates"); }
    finally { if (sequence === candidateSequence.current) setCandidateLoading(false); }
  }
  function select(row: TelegramRegistrationStaffRow) {
    resetSelection(); setSelected(row); setNotice("");
    if (row.status === "PENDING") void findCandidates(row,"");
  }
  async function review(decision: "APPROVE" | "REJECT" | "REQUEST_CORRECTION") {
    if (!selected || savingRef.current || reason.trim().length < 10) return;
    if (decision === "APPROVE" && (!confirmed || !studentId)) return;
    const input: TelegramRegistrationReviewInput = decision === "APPROVE"
      ? { decision, studentId, identityConfirmed: true, reason: reason.trim() }
      : { decision, reason: reason.trim() };
    savingRef.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const result = await api.post<{status:string;notification:string}>(`${root}/${encodeURIComponent(selected.id)}/review`,input);
      setNotice(result.notification === "SENT" ? "Review recorded and Telegram notification sent." : "Review recorded. Telegram notification was not confirmed; contact the student directly."); resetSelection(); setOffset(0); setRevision(n => n+1);
    } catch (e) { setError(e instanceof Error ? e.message : "Review failed"); }
    finally { savingRef.current = false; setSaving(false); }
  }
  if (loading) return <p>Checking permissions…</p>;
  if (!allowed) return <p role="alert">Only authorized programme administrators and coordinators may review registration requests.</p>;
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Review each application against the official roster and independently verify the student controls the Telegram account. Claimed IDs, names, phone and emails are hints only.</p>
    <div className="flex flex-wrap gap-2">{filters.map(value => <button key={value} type="button" aria-pressed={status === value} disabled={saving} className={`${button} ${status === value ? "font-bold ring-2 ring-primary" : ""}`} onClick={() => { resetSelection(); setStatus(value); setOffset(0); setNotice(""); }}>{labels[value]}</button>)}<button className={button} disabled={saving} onClick={() => { resetSelection(); setRevision(n=>n+1); }}>Refresh</button></div>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}{notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="space-y-2 rounded-lg border border-border bg-card p-4"><h2 className="font-semibold">{labels[status]} requests</h2>{fetching ? <p>Loading…</p> : !rows.length ? <p className="text-sm text-muted-foreground">No requests.</p> : rows.map(row => <button key={row.id} disabled={saving} onClick={() => select(row)} className="block w-full rounded-lg border border-border p-3 text-left hover:bg-accent"><p className="font-semibold">{row.latinFamilyName} {row.latinGivenName}</p><p className="text-sm">{row.khmerFamilyName} {row.khmerGivenName}</p><p className="text-xs text-muted-foreground">{row.cohortCode} · {row.sectionCode} · {labels[row.status]}</p></button>)}
      <div className="flex gap-2"><button className={button} disabled={offset===0||fetching||saving} onClick={()=>{resetSelection();setOffset(n=>Math.max(0,n-50));}}>Previous</button><button className={button} disabled={!more||fetching||saving} onClick={()=>{resetSelection();setOffset(n=>n+50);}}>Next</button></div></section>
      {selected && <section className="space-y-4 rounded-lg border border-border bg-card p-4"><h2 className="font-semibold">{selected.latinFamilyName} {selected.latinGivenName}</h2><dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Official ID (claimed)</dt><dd>{selected.officialStudentId ?? "Not provided"}</dd></div><div><dt className="text-muted-foreground">University email</dt><dd className="break-all">{selected.email ?? "Not issued / provided"}</dd><dd className="text-xs font-medium">{selected.emailVerifiedAt ? "Ownership verified by code" : "Awaiting email verification — approval blocked"}</dd></div><div><dt className="text-muted-foreground">Telegram contact</dt><dd>{selected.telegramPhone ?? "Not shared"}</dd></div><div><dt className="text-muted-foreground">Class</dt><dd>{selected.cohortCode} · {selected.sectionCode}</dd></div></dl>
      {selected.status === "PENDING" && <><h3 className="font-semibold">Official roster candidates</h3><form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();void findCandidates(selected,search);}}><input className={field} aria-label="Search roster by name or ID" placeholder="Name or official ID" maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} /><button className={button} disabled={candidateLoading||saving}>Search</button></form>
      {candidateLoading ? <p>Searching…</p> : !candidates.length ? <p className="text-sm text-muted-foreground">No candidate found. Import or correct the official roster first.</p> : candidates.map(c=><label key={c.id} className="flex items-start gap-2 rounded-md border p-2 text-sm"><input type="radio" name="candidate" disabled={!c.canActivate||saving} checked={studentId===c.id} onChange={()=>{setStudentId(c.id);setConfirmed(false);}}/><span>{c.name} · {c.studentId??"No official ID"}<br/>{c.email??"No institutional email"}<br/>{c.hasAccount?"Existing account — secure linking required":c.canActivate?"Eligible for verified review":"Official ID, matching verified university email and unlinked roster record required"}</span></label>)}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={saving||!studentId} onChange={e=>setConfirmed(e.target.checked)} />I independently verified this student's identity, control of Telegram, institutional email and official roster placement.</label>
      <label className="block text-sm">Review reason / verification method (do not enter sensitive evidence)<textarea className={`${field} mt-1 w-full`} rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={saving||!selected.emailVerifiedAt||!confirmed||!studentId||reason.trim().length<10} onClick={()=>void review("APPROVE")}>Approve and link Telegram</button><button className={button} disabled={saving||reason.trim().length<10} onClick={()=>void review("REQUEST_CORRECTION")}>Request correction</button><button className={button} disabled={saving||reason.trim().length<10} onClick={()=>void review("REJECT")}>Reject</button></div></>}
      </section>}
    </div>
  </div>;
}
