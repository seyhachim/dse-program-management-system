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
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [reload,setReload]=useState(0);
  const dirty=Boolean(data&&data.marks.some(m=>(values[m.questionId]??"")!==(m.score===null?"":String(m.score))));
  useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};
    window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  useEffect(()=>{
    let live=true;setData(null);setError("");
    api.post<ExamGradeWorkspace>(endpoint,{offeringId,assessmentItemId,enrollmentId}).then(g=>{
      if(live){setData(g);setValues(Object.fromEntries(g.marks.map(m=>[m.questionId,m.score===null?"":String(m.score)])));}
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
    const body:SaveExamGradeDraft={offeringId,assessmentItemId,enrollmentId,assignmentId:data.assignment.id,assignmentRevision:data.assignment.revision,variantHash:data.assignment.variantHash,expectedGradeRevision:data.gradeRevision,marks:rows.map(r=>({questionId:r.questionId,score:r.score}))};
    setBusy(true);setError("");setNotice("");
    try{
      const saved=await api.post<ExamGradeWorkspace>(endpoint+"/save",body);
      setData(saved);setValues(Object.fromEntries(saved.marks.map(m=>[m.questionId,m.score===null?"":String(m.score)])));
      onSaved(saved);setNotice("Private draft saved.");
    }catch(e){setError(e instanceof Error?e.message:"Save failed. Your local marks are retained.");}
    finally{setBusy(false);}
  }
  return <div className="space-y-3">
    <div className="rounded border p-3"><p className="font-medium">Paper {data.snapshot.variantId} · paper revision {data.snapshot.revision}</p>
      <p className="text-sm">Assignment revision {data.assignment.revision} · draft revision {data.gradeRevision}</p>
      <p className="break-all text-xs text-muted-foreground">{data.snapshot.variantHash}</p></div>
    {!data.canEdit&&<p>Read-only: you are not eligible to edit this draft.</p>}
    {rows.map((r,i)=><div key={r.questionId} className="grid grid-cols-2 items-center gap-2 rounded border p-2 sm:grid-cols-4">
      <label htmlFor={"exam-q-"+i} className="break-all text-sm">Q{i+1} · {r.questionId}</label>
      <span className="text-sm">{r.cloCode} · {r.evidence}</span>
      <input id={"exam-q-"+i} className={field} type="number" min={0} max={r.maxPoints} step="any" value={r.value} aria-invalid={!r.valid} disabled={!data.canEdit||busy} onChange={e=>setValues(v=>({...v,[r.questionId]:e.target.value}))}/>
      <span className="text-sm">/ {r.maxPoints}{!r.valid?" · Invalid":""}</span>
    </div>)}
    <p className="font-medium">Preview total: {total===null?"Incomplete or invalid":String(Math.round(total*1e8)/1e8)} / {data.maximumPoints}</p>
    <p className="text-sm">Saved total: {data.earnedPoints===null?"Not available":data.earnedPoints} · {data.savedAt?new Date(data.savedAt).toLocaleString():"Not saved"}</p>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={!data.canEdit||busy||!valid||(!dirty&&data.gradeRevision>0)} onClick={()=>void save()}>Save private draft</button>
      <button className={button} disabled={busy||!dirty} onClick={()=>{setValues(Object.fromEntries(data.marks.map(m=>[m.questionId,m.score===null?"":String(m.score)])));setError("");}}>Discard local edits</button>
      <button className={button} disabled={busy||dirty} onClick={()=>setReload(x=>x+1)}>Reload saved draft</button>
    </div>
  </div>;
}
