"use client";
import { useEffect, useState } from "react";
import type { ExamGradeWorkspace, ExamWorkspace, SaveExamGradeDraft } from "@dse-pms/shared-types";
import { api } from "@/lib/api";

const endpoint="/api/offerings/exam-variants/grade";
const field="min-h-10 rounded border border-border bg-background p-2 text-sm";
const button="rounded border border-border px-3 py-2 text-sm font-medium disabled:opacity-50";

export function ExamGradeMarkbook({workspace,onSaved}:{workspace:ExamWorkspace;onSaved:(enrollmentId:string,grade:ExamGradeWorkspace)=>void}){
  const [selected,setSelected]=useState("");
  const [dirty,setDirty]=useState(false);
  const assigned=workspace.roster.filter(r=>r.assignment);
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4">
    <h2 className="font-semibold">Question-level examination markbook</h2>
    <p className="text-sm text-muted-foreground">Private drafts only. Blank means ungraded; zero is an assessed score. No grade publication.</p>
    <div className="flex flex-wrap gap-3 text-sm">
      <span>{assigned.length}/{workspace.roster.length} confirmed papers</span>
      <span>{assigned.filter(r=>r.grade?.complete).length} complete drafts</span>
      <span>{assigned.filter(r=>r.grade&&!r.grade.complete).length} incomplete drafts</span>
    </div>
    <label className="block">Student
      <select className={field+" w-full"} value={selected} disabled={dirty} onChange={e=>setSelected(e.target.value)}>
        <option value="">Choose a confirmed paper</option>
        {assigned.map(r=><option key={r.enrollmentId} value={r.enrollmentId}>{r.name} · {r.studentId??"Missing ID"} · {r.assignment?.variantId} · {r.grade?(r.grade.complete?"Complete":"Incomplete"):"Not graded"}</option>)}
      </select>
    </label>
    {dirty&&<p className="text-sm">Save or discard edits before switching students.</p>}
    {selected&&<GradeEditor key={selected} offeringId={workspace.offeringId} assessmentItemId={workspace.assessmentItemId} enrollmentId={selected} onDirty={setDirty} onSaved={g=>onSaved(selected,g)}/>}
  </section>;
}
function GradeEditor({offeringId,assessmentItemId,enrollmentId,onDirty,onSaved}:{offeringId:string;assessmentItemId:string;enrollmentId:string;onDirty:(dirty:boolean)=>void;onSaved:(grade:ExamGradeWorkspace)=>void}){
  const [data,setData]=useState<ExamGradeWorkspace|null>(null);
  const [values,setValues]=useState<Record<string,string>>({});
  const [feedback,setFeedback]=useState<Record<string,string>>({});
  const [reviewReason,setReviewReason]=useState("");
  const [sampleRef,setSampleRef]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [reload,setReload]=useState(0);
  const dirty=Boolean(data&&data.marks.some(m=>(values[m.questionId]??"")!==(m.score===null?"":String(m.score))||(feedback[m.questionId]??"")!==(data.feedback.find(f=>f.questionId===m.questionId)?.comment??"")));
  useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  useEffect(()=>{
    let live=true;setData(null);setError("");
    api.post<ExamGradeWorkspace>(endpoint,{offeringId,assessmentItemId,enrollmentId}).then(g=>{
      if(live){setData(g);setValues(Object.fromEntries(g.marks.map(m=>[m.questionId,m.score===null?"":String(m.score)])));setFeedback(Object.fromEntries(g.feedback.map(f=>[f.questionId,f.comment])));}
    }).catch(()=>{if(live)setError("Grade workspace unavailable. Confirm the paper and your access.");});
    return()=>{live=false;};
  },[offeringId,assessmentItemId,enrollmentId,reload]);
  if(!data)return <div>{error?<p role="alert">{error}</p>:<p>Loading exact paper…</p>}<button className={button} onClick={()=>setReload(x=>x+1)}>Reload</button></div>;
  const rows=data.snapshot.questions.map(q=>{
    const value=values[q.questionId]??"";
    const score=value.trim()===""?null:Number(value);
    return {...q,value,score,valid:score===null||(Number.isFinite(score)&&score>=0&&score<=q.maxPoints)};
  });
  const valid=rows.every(r=>r.valid);
  const complete=valid&&rows.every(r=>r.score!==null);
  const total=complete?rows.reduce((n,r)=>n+(r.score??0),0):null;
  async function save(){
    if(!data||!valid||!data.canEdit||busy)return;
    const body:SaveExamGradeDraft={offeringId,assessmentItemId,enrollmentId,assignmentId:data.assignment.id,assignmentRevision:data.assignment.revision,variantHash:data.assignment.variantHash,expectedGradeRevision:data.gradeRevision,marks:rows.map(r=>({questionId:r.questionId,score:r.score})),feedback:rows.flatMap(r=>feedback[r.questionId]?.trim()?[{questionId:r.questionId,comment:feedback[r.questionId]!.trim()}]:[])};
    setBusy(true);setError("");setNotice("");
    try{
      const saved=await api.post<ExamGradeWorkspace>(endpoint+"/save",body);
      setData(saved);setValues(Object.fromEntries(saved.marks.map(m=>[m.questionId,m.score===null?"":String(m.score)])));setFeedback(Object.fromEntries(saved.feedback.map(f=>[f.questionId,f.comment])));
      onSaved(saved);setNotice("Private draft saved.");
    }catch(e){setError(e instanceof Error?e.message:"Save failed. Your local marks are retained.");}
    finally{setBusy(false);}
  }
  async function moderate(outcome:"Accepted"|"ChangesRequired"){
    if(!data||dirty||busy||!data.canModerate||data.sampleModeration)return;
    setBusy(true);setError("");setNotice("");
    try{
      const reviewed=await api.post<ExamGradeWorkspace>(endpoint+"/moderate",{offeringId,assessmentItemId,enrollmentId,assignmentId:data.assignment.id,gradeRevision:data.gradeRevision,outcome,reason:reviewReason,sampleRef});
      setData(reviewed);setNotice("Sample review recorded for this exact saved revision.");setReviewReason("");setSampleRef("");
    }catch(e){setError(e instanceof Error?e.message:"Sample moderation failed.");}finally{setBusy(false);}
  }
  return <div className="space-y-3">
    <div className="rounded border p-3"><p className="font-medium">Paper {data.snapshot.variantId} · paper revision {data.snapshot.revision}</p>
      <p className="text-sm">Assignment revision {data.assignment.revision} · draft revision {data.gradeRevision}</p>
      <p className="break-all text-xs text-muted-foreground">{data.snapshot.variantHash}</p></div>
    {!data.academicDossierId?<p role="status">Read-only until this exact paper has an independently approved academic dossier.</p>:!data.canEdit?<p>Read-only: you are not eligible to edit this draft.</p>:null}
    {data.gradeRevision>0&&!data.savedDossierId&&<p>Historical draft: no academic dossier was recorded at the time of saving. Reverification is required.</p>}
    {rows.map((r,i)=>{const component=data.blueprint?.components.find(q=>q.questionId===r.questionId);return <div key={r.questionId} className="grid grid-cols-2 items-center gap-2 rounded border p-2 sm:grid-cols-4">
      <label htmlFor={"exam-q-"+i} className="break-all text-sm">{component?component.parentLabel+"("+component.componentLabel+")":"Q"+(i+1)} · {data.questionLabels[r.questionId]??r.questionId}</label>
      <span className="text-sm">{r.cloCode} · {r.evidence}</span>
      <input id={"exam-q-"+i} className={field} type="number" min={0} max={r.maxPoints} step="any" value={r.value} aria-invalid={!r.valid} disabled={!data.canEdit||busy} onChange={e=>setValues(v=>({...v,[r.questionId]:e.target.value}))}/>
      <span className="text-sm">/ {r.maxPoints}{!r.valid?" · Invalid":""}</span>
      {component&&<details className="col-span-full text-sm"><summary className="cursor-pointer">Restricted marking instructions · {component.bloom}</summary><p>Answer reference: {component.expectedAnswerRef}</p><p>Partial credit: {component.partialCredit}</p></details>}
      <label className="col-span-full text-sm">Question feedback<textarea className={field+" w-full"} maxLength={1000} value={feedback[r.questionId]??""} disabled={!data.canEdit||busy} onChange={e=>setFeedback(f=>({...f,[r.questionId]:e.target.value}))}/></label>
    </div>;})}
    <p className="font-medium">Preview total: {total===null?"Incomplete or invalid":String(Math.round(total*1e8)/1e8)} / {data.maximumPoints}</p>
    <p className="text-sm">Saved total: {data.earnedPoints===null?"Not available":data.earnedPoints} · {data.savedAt?new Date(data.savedAt).toLocaleString():"Not saved"}</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={!data.canEdit||busy||!valid||(!dirty&&data.gradeRevision>0&&Boolean(data.savedDossierId))} onClick={()=>void save()}>Save private draft</button>
      <button className={button} disabled={busy||!dirty} onClick={()=>{setValues(Object.fromEntries(data.marks.map(m=>[m.questionId,m.score===null?"":String(m.score)])));setFeedback(Object.fromEntries(data.feedback.map(f=>[f.questionId,f.comment])));setError("");}}>Discard local edits</button>
      <button className={button} disabled={busy||dirty} onClick={()=>setReload(x=>x+1)}>Reload saved draft</button>
    </div>
    {data.sampleModeration&&<div className="rounded border p-3"><h3 className="font-medium">Sample moderation · revision {data.sampleModeration.gradeRevision}</h3><p>{data.sampleModeration.outcome} · {data.sampleModeration.reason}</p><p className="text-sm">Evidence reference: {data.sampleModeration.sampleRef}</p></div>}
    {data.canModerate&&!data.sampleModeration&&<div className="space-y-2 rounded border p-3">
      <h3 className="font-medium">Independent sample moderation</h3><p className="text-sm">Review the actual marked work against the approved marking scheme. This reviews one exact revision, not the entire class.</p>
      <label className="block text-sm">Restricted sample reference<input className={field+" w-full"} maxLength={256} value={sampleRef} onChange={e=>setSampleRef(e.target.value)}/></label>
      <label className="block text-sm">Review rationale<textarea className={field+" w-full"} maxLength={2000} value={reviewReason} onChange={e=>setReviewReason(e.target.value)}/></label>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy||dirty||reviewReason.trim().length<10||!sampleRef.trim()} onClick={()=>void moderate("Accepted")}>Accept sampled marks</button><button className={button} disabled={busy||dirty||reviewReason.trim().length<10||!sampleRef.trim()} onClick={()=>void moderate("ChangesRequired")}>Request changes</button></div>
    </div>}
  </div>;
}
