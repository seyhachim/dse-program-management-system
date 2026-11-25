"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { CourseDeliveryOffering, ExamWorkspace, ExamWorkspaceHistory, ExamWorkspacePrepare, ExamWorkspaceQuestion, ExamWorkspaceSnapshot } from "@dse-pms/shared-types";
import { api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { courseDeliveryApi } from "@/lib/course-delivery";

const base="/api/offerings/exam-variants/";
const field="w-full min-h-10 rounded border border-border bg-background p-2 text-sm";
const btn="rounded border border-border px-3 py-2 text-sm font-medium disabled:opacity-50";
const panel="space-y-3 rounded-xl border border-border bg-card p-4";

export default function ExamVariantsPage(){
  const {me,loading}=useMe();
  if(process.env.NEXT_PUBLIC_EXAM_VARIANT_WORKSPACE_ENABLED!=="true")return <main className="p-6">Examination workspace disabled.</main>;
  if(loading)return <main className="p-6">Loading account…</main>;
  if(!me||!me.roles.some(r=>["admin","program_coordinator","lecturer"].includes(r)))return <main className="p-6">Staff access required.</main>;
  return <Picker key={me.id}/>;
}
function Picker(){
  const [rows,setRows]=useState<CourseDeliveryOffering[]>([]);
  const [oid,setOid]=useState("");
  const [aid,setAid]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{let live=true;courseDeliveryApi.offerings().then(v=>{if(live)setRows(v.filter(o=>o.specificationStatus==="Approved"));}).catch(()=>{if(live)setError("Could not load offerings.");});return()=>{live=false;};},[]);
  const exams=rows.find(o=>o.offeringId===oid)?.assessments.filter(a=>a.type.toLowerCase()==="exam"&&a.mode==="individual"&&!a.rubricId&&a.countsTowardGrade)??[];
  return <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
    <Link href="/course-delivery" className="underline">Course Delivery</Link>
    <h1 className="text-2xl font-semibold">Examination paper management</h1><p>Isolated pilot · No marks or grade release.</p>
    {error&&<p role="alert">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2">
      <label>Offering<select className={field} value={oid} onChange={e=>{setOid(e.target.value);setAid("");}}><option value="">Choose offering</option>{rows.map(o=><option value={o.offeringId} key={o.offeringId}>{o.code} · {o.sectionCode} · {o.term}</option>)}</select></label>
      <label>Exam<select className={field} value={aid} onChange={e=>setAid(e.target.value)}><option value="">Choose eligible exam</option>{exams.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
    </div>{oid&&aid&&<Workspace key={oid+":"+aid} offeringId={oid} assessmentItemId={aid}/>}
  </main>;
}
function Workspace({offeringId,assessmentItemId}:{offeringId:string;assessmentItemId:string}){
  const scope={offeringId,assessmentItemId};
  const [data,setData]=useState<ExamWorkspace|null>(null);
  const [reload,setReload]=useState(0);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [instrument,setInstrument]=useState("");
  const [variant,setVariant]=useState("");
  const [rev,setRev]=useState("1");
  const [maximum,setMaximum]=useState("");
  const [maps,setMaps]=useState<Record<string,{cloCode:string;evidence:ExamWorkspaceQuestion["evidence"]}>>({});
  const [preview,setPreview]=useState<{inputKey:string;snapshot:ExamWorkspaceSnapshot}|null>(null);
  const [decisionRef,setDecisionRef]=useState("");
  const [paperHash,setPaperHash]=useState("");
  const [chosen,setChosen]=useState<string[]>([]);
  const [reason,setReason]=useState("");
  const [evidenceRef,setEvidenceRef]=useState("");
  const [history,setHistory]=useState<ExamWorkspaceHistory[]|null>(null);
  useEffect(()=>{let live=true;setData(null);api.post<ExamWorkspace>(base+"workspace",{offeringId,assessmentItemId}).then(v=>{if(live)setData(v);}).catch(()=>{if(live)setError("Workspace unavailable or access denied.");});return()=>{live=false;};},[offeringId,assessmentItemId,reload]);
  async function run(action:string,body:unknown,message:string){
    setBusy(true);setError("");setNotice("");
    try{await api.post(base+action,body);setNotice(message);setChosen([]);setHistory(null);setReload(x=>x+1);}
    catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}
  }
  if(!data)return <section className={panel}>{error?<p role="alert">{error}</p>:<p>Loading protected workspace…</p>}<button className={btn} onClick={()=>{setError("");setReload(x=>x+1);}}>Reload</button></section>;
  const questions=data.instruments.find(i=>i.id===instrument)?.criterionRows??[];
  const total=questions.reduce((s,q)=>s+(q.maxPoints??0),0);
  const max=data.examMaximum??Number(maximum);
  const ready=variant.trim()&&Number.isInteger(Number(rev))&&Number(rev)>0&&max>0&&questions.length>0&&questions.every(q=>(q.maxPoints??0)>0&&maps[q.id]?.cloCode)&&Math.abs(total-max)<=Math.max(total,max)*1e-12;
  const paper=data.papers.find(p=>p.variantHash===paperHash&&p.permitted);
  const eligible=data.roster.filter(r=>r.eligible&&!r.hasResult&&r.assignment?.variantHash!==paperHash);
  const selected=eligible.filter(r=>chosen.includes(r.enrollmentId));
  const body:ExamWorkspacePrepare={...scope,instrumentId:instrument,variantId:variant.trim(),revision:Number(rev),examMaximum:max,mappings:questions.map(q=>({questionId:q.id,...maps[q.id]!}))};
  const inputKey=JSON.stringify(body);
  const verified=preview?.inputKey===inputKey?preview.snapshot:null;
  async function verify(){
    setBusy(true);setError("");setPreview(null);
    try{const snapshot=await api.post<ExamWorkspaceSnapshot>(base+"preview",body);setPreview({inputKey,snapshot});}
    catch(e){setError(e instanceof Error?e.message:"Preview unavailable");}finally{setBusy(false);}
  }
  function submit(){if(verified){setPreview(null);void run("submit",{...body,expectedHash:verified.variantHash},"Submitted for moderation.");}}
  function assign(){if(!paper)return;void run("assign",{...scope,entries:selected.map(r=>({enrollmentId:r.enrollmentId,variantId:paper.variantId,variantHash:paper.variantHash,expectedRevision:r.assignment?.revision??0,reason,evidenceRef}))},"Assignments confirmed atomically.");}
  return <div className="space-y-4">
    {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
    {data.canPrepare&&<section className={panel}><h2 className="font-semibold">Prepare variant</h2>
      <label>Marking scheme<select className={field} value={instrument} onChange={e=>{setInstrument(e.target.value);setMaps({});}}><option value="">Choose active scheme</option>{data.instruments.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
      <div className="grid gap-2 md:grid-cols-3"><label>Variant<input className={field} value={variant} onChange={e=>setVariant(e.target.value)}/></label><label>Revision<input className={field} type="number" min={1} value={rev} onChange={e=>setRev(e.target.value)}/></label><label>Exam maximum<input className={field} type="number" min={1} value={data.examMaximum??maximum} readOnly={data.examMaximum!==null} onChange={e=>setMaximum(e.target.value)}/></label></div>
      <p>Local preview · {questions.length} questions · {total} points</p>
      {questions.map(q=><div key={q.id} className="grid gap-2 md:grid-cols-3"><p>{q.id} · {q.maxPoints??"Invalid"} points</p><label>CLO<select className={field} value={maps[q.id]?.cloCode??""} onChange={e=>setMaps(m=>({...m,[q.id]:{cloCode:e.target.value,evidence:m[q.id]?.evidence??"supporting"}}))}><option value="">Choose CLO</option>{data.activeCloCodes.map(c=><option key={c}>{c}</option>)}</select></label><label>Evidence<select className={field} value={maps[q.id]?.evidence??"supporting"} onChange={e=>setMaps(m=>({...m,[q.id]:{cloCode:m[q.id]?.cloCode??"",evidence:e.target.value as ExamWorkspaceQuestion["evidence"]}}))}><option value="supporting">Supporting</option><option value="direct">Direct</option></select></label></div>)}
      <div className="flex flex-wrap gap-2"><button className={btn} disabled={busy||!ready} onClick={()=>void verify()}>Verify exact preview</button>
      <button className={btn} disabled={busy||!ready||!verified} onClick={submit}>Submit for independent moderation</button></div>
      {verified&&<p className="break-all text-xs">Verified hash: {verified.variantHash}</p>}</section>}
    <section className={panel}><h2 className="font-semibold">Moderation queue</h2>{data.canReview&&<label>Decision reference or return reason<input className={field} value={decisionRef} onChange={e=>setDecisionRef(e.target.value)}/></label>}
      {!data.submissions.length&&<p>No submissions.</p>}{data.submissions.map(s=><article key={s.id} className="space-y-2 rounded border p-3"><p>{s.snapshot.variantId} · r{s.snapshot.revision} · {s.status}</p><p className="break-all text-xs">{s.snapshot.variantHash}</p><ul className="text-sm">{s.snapshot.questions.map(q=><li key={q.questionId}>{q.questionId}: {q.maxPoints} · {q.cloCode} · {q.evidence}</li>)}</ul>{s.decisionRef&&<p>{s.decisionRef}</p>}{data.canReview&&s.status==="Pending"&&s.submittedById!==data.actorId&&<div className="flex gap-2">{(["Approved","Returned"] as const).map(decision=><button key={decision} className={btn} disabled={busy||!decisionRef.trim()} onClick={()=>void run("decide",{...scope,submissionId:s.id,expectedHash:s.snapshot.variantHash,decision,decisionRef},decision)}>{decision==="Approved"?"Approve exact version":"Return"}</button>)}</div>}</article>)}
    </section>
    <section className={panel}><h2 className="font-semibold">Approved versions and permissions</h2>{data.papers.map(p=><div key={p.variantHash} className="flex flex-wrap justify-between gap-2"><span>{p.variantId} · r{p.revision} · {p.permitted?"Permitted":"Not permitted"}</span>{data.canReview&&!p.permitted&&<button className={btn} disabled={busy} onClick={()=>void run("permit",{...scope,variantId:p.variantId,variantHash:p.variantHash},"Permission granted.")}>Permit for class</button>}</div>)}</section>
    <section className={panel}><h2 className="font-semibold">Actual student paper assignment</h2>
      {data.canAssign&&<div className="grid gap-2 md:grid-cols-2"><label>Exact paper<select className={field} value={paperHash} onChange={e=>{setPaperHash(e.target.value);setChosen([]);}}><option value="">Choose paper</option>{data.papers.filter(p=>p.permitted).map(p=><option key={p.variantHash} value={p.variantHash}>{p.variantId} · r{p.revision}</option>)}</select></label><label>Reason<input className={field} value={reason} onChange={e=>setReason(e.target.value)}/></label><label>Opaque evidence reference<input className={field} value={evidenceRef} onChange={e=>setEvidenceRef(e.target.value)}/></label></div>}
      {data.roster.map(r=><div key={r.enrollmentId} className="flex flex-wrap items-center gap-3 rounded border p-2 text-sm">{data.canAssign&&<input type="checkbox" aria-label={"Select "+r.name} checked={chosen.includes(r.enrollmentId)} disabled={busy||!paper||!eligible.some(x=>x.enrollmentId===r.enrollmentId)} onChange={e=>setChosen(ids=>e.target.checked?[...ids,r.enrollmentId]:ids.filter(x=>x!==r.enrollmentId))}/>}<div className="flex-1">{r.name} · {r.studentId??"Missing ID"}<p>{r.assignment?r.assignment.variantId+" · revision "+r.assignment.revision:"Unassigned"}{r.hasResult?" · Result locked":""}</p></div>{r.assignment&&<button className={btn} disabled={busy} onClick={async()=>{setBusy(true);setHistory(null);try{setHistory(await api.post<ExamWorkspaceHistory[]>(base+"history",{...scope,enrollmentId:r.enrollmentId}));}catch{setError("History unavailable");}finally{setBusy(false);}}}>History</button>}</div>)}
      {data.canAssign&&<button className={btn} disabled={busy||!paper||!selected.length||selected.length>50||reason.trim().length<5||!evidenceRef.trim()} onClick={assign}>Confirm {selected.length} actual paper(s)</button>}
      {history&&<div className="space-y-2"><h3>Assignment history</h3>{history.map(e=><p key={e.revision}>r{e.revision}: {e.previousVariantId??"Unassigned"} → {e.variantId} · {e.reason} · {e.evidenceRef}</p>)}</div>}
    </section>
  </div>;
}
