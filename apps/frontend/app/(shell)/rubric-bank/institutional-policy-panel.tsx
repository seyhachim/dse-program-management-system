"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { subscribeAuthIdentityChange } from "@/lib/auth";

const endpoint = "/api/rubrics/institutional-policies/dse";
const topics = [["obe","Outcome-based education"],["ai","Responsible AI"],["grade_appeal","Grade appeals"],["data_protection","Data protection"]] as const;
type Topic = (typeof topics)[number][0];
export type PolicyCitation = {
  id: string; topic: Topic; revision: number; title: string; institutionalOwner: string;
  version: string | null; effectiveDate: string | null; locator: string | null;
  modules: string; status: "pending" | "verified" | "archived"; classification: string;
  createdAt: string; verifiedAt: string | null;
};
type Registry = {canManage: boolean; records: PolicyCitation[]};
type Draft = {topic: Topic; expectedRevision: number; title: string; institutionalOwner: string; version: string; effectiveDate: string; locator: string; modules: string; status: PolicyCitation["status"]};
const initial: Draft = {topic:"obe",expectedRevision:0,title:"",institutionalOwner:"",version:"",effectiveDate:"",locator:"",modules:"Assessment",status:"pending"};

export function InstitutionalPolicyPanel({onVerifiedObe}: {onVerifiedObe: (record: PolicyCitation | null) => void}) {
  const [registry,setRegistry] = useState<Registry | null>(null);
  const [draft,setDraft] = useState<Draft>(initial);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [refresh,setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setRegistry(null); onVerifiedObe(null); setError("");
    const unsubscribe = subscribeAuthIdentityChange(() => {
      active = false; setRegistry(null); setDraft(initial); onVerifiedObe(null);
    });
    void api.getUnshared<Registry>(endpoint).then(value => {
      if (!active) return;
      setRegistry(value);
      onVerifiedObe(value.records.find(r => r.topic === "obe" && r.status === "verified") ?? null);
    }).catch(err => {
      if (active && !(err instanceof ApiError && (err.status === 403 || err.status === 404))) setError("Institutional references unavailable");
    });
    return () => { active = false; unsubscribe(); };
  },[refresh,onVerifiedObe]);
  function select(topic: Topic) {
    const row = registry?.records.find(r => r.topic === topic);
    setDraft(row ? {topic,expectedRevision:row.revision,title:row.title,institutionalOwner:row.institutionalOwner,
      version:row.version ?? "",effectiveDate:row.effectiveDate ?? "",locator:row.locator ?? "",modules:row.modules,status:row.status} : {...initial,topic});
  }
  async function save() {
    setBusy(true); setError("");
    try {
      await api.postUnshared(endpoint,{...draft,version:draft.version.trim() || null,effectiveDate:draft.effectiveDate || null,locator:draft.locator.trim() || null});
      setDraft(initial); setRefresh(v => v+1);
    } catch { setError("Revision not saved. Reload references and verify the metadata."); }
    finally {setBusy(false);}
  }
  if (!registry) return error ? <p role="status" className="text-sm text-muted-foreground">{error}</p> : null;
  return <section className="rounded-xl border border-border bg-card p-5 space-y-3">
    <h2 className="font-semibold">Institutional policy register</h2>
    <p className="text-sm text-muted-foreground">Internal staff reference only. Enter bibliographic metadata, never policy text, files, or source links. Revisions are retained.</p>
    {topics.map(([topic,label]) => {
      const row=registry.records.find(r=>r.topic===topic);
      if (!row && !registry.canManage) return null;
      return <div key={topic} className="rounded-md border border-border p-3 text-sm">
        <div className="font-medium">{row?.title ?? label}</div>
        {row ? <p>{row.institutionalOwner} · {row.version ?? "Version unconfirmed"} · {row.locator ?? "Locator unconfirmed"} · {row.status} · revision {row.revision}</p> : <p>Not registered</p>}
        {registry.canManage && <button type="button" onClick={()=>select(topic)} className="underline text-sm mt-1">Prepare revision</button>}
      </div>;
    })}
    {registry.canManage && <form className="grid gap-3 rounded-md border border-border p-3" onSubmit={e=>{e.preventDefault();void save();}}>
      <label className="text-sm">Policy topic<select className="block w-full rounded border border-input bg-background p-2" value={draft.topic} onChange={e=>select(e.target.value as Topic)}>{topics.map(([k,n])=><option key={k} value={k}>{n}</option>)}</select></label>
      {([["title","Policy title"],["institutionalOwner","Institutional owner"],["version","Version"],["locator","Section / printed pages"],["modules","Applicable modules"]] as const).map(([key,label])=><label key={key} className="text-sm">{label}<input className="block w-full rounded border border-input bg-background p-2" required={key==="title" || key==="institutionalOwner" || key==="modules" || (draft.status==="verified" && (key==="version" || key==="locator"))} value={draft[key]} onChange={e=>setDraft(v=>({...v,[key]:e.target.value}))}/></label>)}
      <label className="text-sm">Effective date (if verified)<input type="date" className="block w-full rounded border border-input bg-background p-2" value={draft.effectiveDate} onChange={e=>setDraft(v=>({...v,effectiveDate:e.target.value}))}/></label>
      <label className="text-sm">Review status<select className="block w-full rounded border border-input bg-background p-2" value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value as Draft["status"]}))}><option value="pending">Pending review</option><option value="verified">Verified against authorized source</option><option value="archived">Archived</option></select></label>
      <button type="submit" disabled={busy} className="rounded border border-input p-2">{busy?"Saving…":"Save new revision"}</button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
