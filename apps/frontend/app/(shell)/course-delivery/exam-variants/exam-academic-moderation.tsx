"use client";
import { useEffect, useState } from "react";
import type { ExamAcademicBlueprintInput, ExamAcademicComponentInput, ExamAcademicDistribution, ExamAcademicWorkspace, ExamBloomLevel, ExamWorkspace } from "@dse-pms/shared-types";
import { api } from "@/lib/api";
const base="/api/offerings/exam-variants/academic";
const field="w-full min-h-10 rounded border border-border bg-background p-2 text-sm";
const btn="rounded border border-border px-3 py-2 text-sm font-medium disabled:opacity-50";
const checks=["coverage","cognitiveDemand","difficulty","workload","scoringRules","fairness"] as const;
const checkLabels={coverage:"CLO and topic coverage",cognitiveDemand:"Cognitive demand",difficulty:"Comparable difficulty",workload:"Time and workload",scoringRules:"Scoring and partial-credit consistency",fairness:"Fairness and assessment conditions"};
type DraftComponent=Omit<ExamAcademicComponentInput,"bloom">&{bloom:ExamBloomLevel|""};
const blooms:ExamBloomLevel[]=["Remember","Understand","Apply","Analyze","Evaluate","Create"];

function Distribution({rows}:{rows:ExamAcademicDistribution}){
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>CLO</th><th>Evidence</th><th>Cognitive level</th><th>Marks</th></tr></thead><tbody>{rows.map(r=><tr key={r.cloCode+":"+r.evidence+":"+r.bloom} className="border-t"><td>{r.cloCode}</td><td>{r.evidence}</td><td>{r.bloom}</td><td>{r.points}</td></tr>)}</tbody></table></div>;
}
export function ExamAcademicModeration({workspace,onChanged}:{workspace:ExamWorkspace;onChanged:()=>void}){
  const [hash,setHash]=useState("");
  const selected=workspace.papers.find(p=>p.variantHash===hash);
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4">
    <h2 className="font-semibold">Academic blueprint and equivalence moderation</h2>
    <p className="text-sm text-muted-foreground">Independent review required before grading. Use restricted document references, not answer keys or student details in this workspace.</p>
    <label className="block">Exact approved paper<select className={field} value={hash} onChange={e=>setHash(e.target.value)}><option value="">Choose paper</option>{workspace.papers.map(p=><option key={p.variantHash} value={p.variantHash}>{p.variantId} · r{p.revision} · {p.permitted?"Permitted":"Review only"}</option>)}</select></label>
    {selected&&<DossierEditor key={hash} workspace={workspace} variantId={selected.variantId} variantHash={hash} onChanged={onChanged}/>}
  </section>;
}
function DossierEditor({workspace,variantId,variantHash,onChanged}:{workspace:ExamWorkspace;variantId:string;variantHash:string;onChanged:()=>void}){
  const {offeringId,assessmentItemId,actorId}=workspace;
  const scope={offeringId,assessmentItemId,variantId,variantHash};
  const [data,setData]=useState<ExamAcademicWorkspace|null>(null);
  const [duration,setDuration]=useState("");
  const [conditions,setConditions]=useState("");
  const [schemeRef,setSchemeRef]=useState("");
  const [components,setComponents]=useState<DraftComponent[]>([]);
  const [accepted,setAccepted]=useState<string[]>([]);
  const [rationale,setRationale]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    let live=true;
    setData(null);setError("");setAccepted([]);setRationale("");
    api.post<ExamAcademicWorkspace>(base,{offeringId,assessmentItemId,variantId,variantHash}).then(d=>{
      if(!live)return;
      setData(d);
      const previous=d.dossiers.find(r=>r.status==="Returned")?.blueprint;
      setDuration(previous?String(previous.durationMinutes):"");setConditions(previous?.conditions??"");setSchemeRef(previous?.restrictedSchemeRef??"");
      setComponents(d.snapshot.questions.map((q,i)=>{
        const old=previous?.components.find(x=>x.questionId===q.questionId);
        return old?{questionId:old.questionId,parentLabel:old.parentLabel,componentLabel:old.componentLabel,topic:old.topic,bloom:old.bloom,expectedAnswerRef:old.expectedAnswerRef,partialCredit:old.partialCredit}:
          {questionId:q.questionId,parentLabel:"Q"+(i+1),componentLabel:"a",topic:"",bloom:"",expectedAnswerRef:"",partialCredit:""};
      }));
    }).catch(()=>{if(live)setError("Academic dossier unavailable or access denied.");});
    return()=>{live=false;};
  },[offeringId,assessmentItemId,variantId,variantHash,reload]);
  function update(i:number,key:keyof Omit<DraftComponent,"questionId">,value:string){
    setComponents(old=>old.map((q,j)=>i===j?{...q,[key]:value} as DraftComponent:q));
  }
  async function run(action:string,body:unknown){
    setBusy(true);setError("");
    try{await api.post(base+action,body);setReload(x=>x+1);onChanged();}
    catch(e){setError(e instanceof Error?e.message:"Academic action failed");}finally{setBusy(false);}
  }
  if(!data)return <div>{error?<p role="alert">{error}</p>:<p>Loading academic dossier…</p>}<button className={btn} onClick={()=>setReload(x=>x+1)}>Reload</button></div>;
  const blueprint:ExamAcademicBlueprintInput={durationMinutes:Number(duration),conditions,restrictedSchemeRef:schemeRef,components:components.map(c=>({...c,bloom:c.bloom as ExamBloomLevel}))};
  const ready=Number.isInteger(blueprint.durationMinutes)&&blueprint.durationMinutes>0&&blueprint.durationMinutes<=720&&conditions.trim().length>=3&&schemeRef.trim()&&components.every(q=>q.parentLabel.trim()&&q.componentLabel.trim()&&q.topic.trim()&&q.bloom!==""&&q.expectedAnswerRef.trim()&&q.partialCredit.trim().length>=3);
  return <div className="space-y-4">
    {error&&<p role="alert">{error}</p>}
    <div className="rounded border p-3 space-y-2">
      <h3 className="font-medium">Approved comparison baseline</h3>
      {data.baseline?<><p>{data.baseline.variantId} · {data.baseline.durationMinutes} minutes · {data.baseline.conditions}</p><Distribution rows={data.baseline.distribution}/></>:<p>The first independently approved dossier establishes the baseline. This is not an automatic fairness claim.</p>}
    </div>
    {data.canSubmit&&<div className="space-y-3">
      <h3 className="font-medium">Table of specifications</h3>
      <div className="grid gap-2 md:grid-cols-3"><label>Duration (minutes)<input className={field} type="number" min={1} max={720} value={duration} onChange={e=>setDuration(e.target.value)}/></label>
      <label>Assessment conditions<input className={field} maxLength={1000} value={conditions} onChange={e=>setConditions(e.target.value)}/></label>
      <label>Restricted marking scheme reference<input className={field} maxLength={256} value={schemeRef} onChange={e=>setSchemeRef(e.target.value)}/></label></div>
      {components.map((c,i)=>{const q=data.snapshot.questions[i]!;return <div key={c.questionId} className="space-y-2 rounded border p-3">
        <p className="font-medium">{data.questionLabels[c.questionId]??c.questionId} · {q.maxPoints} marks · {q.cloCode} · {q.evidence}</p>
        <div className="grid gap-2 md:grid-cols-3">
          <label>Parent question<input className={field} maxLength={80} value={c.parentLabel} onChange={e=>update(i,"parentLabel",e.target.value)}/></label>
          <label>Scored part<input className={field} maxLength={80} value={c.componentLabel} onChange={e=>update(i,"componentLabel",e.target.value)}/></label>
          <label>Topic<input className={field} maxLength={80} value={c.topic} onChange={e=>update(i,"topic",e.target.value)}/></label>
          <label>Cognitive level<select className={field} value={c.bloom} onChange={e=>update(i,"bloom",e.target.value)}><option value="">Choose level</option>{blooms.map(b=><option key={b}>{b}</option>)}</select></label>
          <label>Expected answer reference<input className={field} maxLength={256} value={c.expectedAnswerRef} onChange={e=>update(i,"expectedAnswerRef",e.target.value)}/></label>
          <label>Partial-credit instructions<textarea className={field} maxLength={2000} value={c.partialCredit} onChange={e=>update(i,"partialCredit",e.target.value)}/></label>
        </div></div>;})}
      <button className={btn} disabled={!ready||busy} onClick={()=>void run("/submit",{...scope,baselineId:data.baseline?.id??null,blueprint})}>Submit academic dossier</button>
    </div>}
    {data.dossiers.map(d=><article key={d.id} className="space-y-2 rounded border p-3">
      <h3 className="font-medium">{d.status} · {d.blueprint.durationMinutes} minutes · {new Date(d.submittedAt).toLocaleString()}</h3>
      <p>{d.blueprint.conditions} · Scheme reference: {d.blueprint.restrictedSchemeRef}</p>
      <Distribution rows={d.distribution}/>
      <details><summary className="cursor-pointer">Restricted component instructions</summary>{d.blueprint.components.map(q=><div key={q.questionId} className="border-t py-2 text-sm"><p>{q.parentLabel}({q.componentLabel}) · {q.topic} · {q.maxPoints} marks · {q.bloom} · {q.cloCode} · {q.evidence}</p><p>Answer reference: {q.expectedAnswerRef}</p><p>Partial credit: {q.partialCredit}</p></div>)}</details>
      {d.review!==null&&typeof d.review==="object"&&"rationale" in d.review&&<p>Review: {String(d.review.rationale)}</p>}
      {data.canReview&&d.status==="Pending"&&d.submittedById!==actorId&&<div className="space-y-2 border-t pt-2">
        <p className="text-sm">Review the actual controlled scheme and paper. Confirm each criterion independently, including the baseline comparison where applicable.</p>
        {checks.map(k=><label key={k} className="flex gap-2 items-center"><input type="checkbox" checked={accepted.includes(k)} onChange={e=>setAccepted(a=>e.target.checked?[...a,k]:a.filter(x=>x!==k))}/>{checkLabels[k]}</label>)}
        <label>Review rationale<textarea className={field} maxLength={2000} value={rationale} onChange={e=>setRationale(e.target.value)}/></label>
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={busy||accepted.length!==checks.length||rationale.trim().length<10||d.baselineId!==(data.baseline?.id??null)} onClick={()=>void run("/decide",{...scope,dossierId:d.id,decision:"Approved",review:{...Object.fromEntries(checks.map(k=>[k,true])),rationale}})}>Approve academic dossier</button>
          <button className={btn} disabled={busy||rationale.trim().length<10} onClick={()=>void run("/decide",{...scope,dossierId:d.id,decision:"Returned",review:{rationale}})}>Return for revision</button>
        </div>
      </div>}
    </article>)}
  </div>;
}
