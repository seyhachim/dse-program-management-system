"use client";
import { useState } from "react";
import type { ExamCloPreview, ExamCloPreviewRow, ExamWorkspace } from "@dse-pms/shared-types";
import { api } from "@/lib/api";
const percent=(n:number|null)=>n===null?"—":n+"%";
function EvidenceTable({rows}:{rows:ExamCloPreviewRow[]}){
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead><tr><th className="p-2">CLO / evidence</th><th className="p-2">Mapped</th><th className="p-2">Available</th><th className="p-2">Missing</th><th className="p-2">Not mapped</th><th className="p-2">Unknown mapping</th><th className="p-2">Mean</th><th className="p-2">Scenario met / available</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.cloCode+":"+r.role} className="border-t"><th className="p-2 font-medium">{r.cloCode} · {r.role}</th><td className="p-2">{r.mapped}</td><td className="p-2">{r.available}</td><td className="p-2">{r.missing}</td><td className="p-2">{r.notMapped}</td><td className="p-2">{r.unknownMapping}</td><td className="p-2">{percent(r.meanPercentage)}</td><td className="p-2">{r.meetsScenarioRate===null?"—":r.meetsScenarioCount+"/"+r.available+" ("+percent(r.meetsScenarioRate)+")"}</td></tr>)}</tbody>
  </table></div>;
}
export function ExamCloEvidencePreview({workspace}:{workspace:ExamWorkspace}){
  const [threshold,setThreshold]=useState("");
  const [report,setReport]=useState<ExamCloPreview|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const scenario=threshold.trim()===""?null:Number(threshold);
  const valid=scenario===null||(Number.isFinite(scenario)&&scenario>=0&&scenario<=100);
  async function calculate(){
    if(!valid||busy)return;
    setBusy(true);setError("");setReport(null);
    try{setReport(await api.post<ExamCloPreview>("/api/offerings/exam-variants/clo/preview",{offeringId:workspace.offeringId,assessmentItemId:workspace.assessmentItemId,scenarioThreshold:scenario}));}
    catch(e){setError(e instanceof Error?e.message:"Could not calculate private evidence preview.");}finally{setBusy(false);}
  }
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4">
    <h2 className="font-semibold">CLO evidence preview — examination only</h2>
    <p className="text-sm text-muted-foreground">Private, provisional analysis of saved drafts. Not official CLO attainment, a released grade, or course-level evidence. Supporting evidence is never counted as direct attainment.</p>
    <label className="block text-sm">Optional what-if threshold (%)<input className="block w-full min-h-10 rounded border border-border bg-background p-2" type="number" min={0} max={100} step="any" placeholder="None — descriptive evidence only" value={threshold} onChange={e=>{setThreshold(e.target.value);setReport(null);}} disabled={busy}/></label>
    <button className="rounded border border-border px-3 py-2 text-sm font-medium disabled:opacity-50" disabled={!valid||busy} onClick={()=>void calculate()}>{busy?"Calculating…":"Calculate saved-draft preview"}</button>
    {error&&<p role="alert">{error}</p>}
    {report&&<div className="space-y-3">
      <p className="text-sm">Roster: {report.population} · {report.students.filter(s=>s.eligible).length} eligible · {report.students.filter(s=>s.status==="available").length} usable draft records. {report.scenarioThreshold===null?"No achievement threshold applied.":"What-if threshold "+report.scenarioThreshold+"% — not approved policy."}</p>
      <p className="text-sm">This is a point-in-time preview. Recalculate after any assignment, grading or moderation change. Means use normalized percentages, not pooled marks. Missing records are excluded from means and explicitly counted.</p>
      <EvidenceTable rows={report.rows}/>
      {report.byPaper.map(p=><details key={p.variantHash} className="rounded border p-2"><summary>Paper {p.variantId} · {p.population} enrollments</summary><p className="break-all text-xs">{p.variantHash}</p><EvidenceTable rows={p.rows}/></details>)}
      <details className="rounded border p-2"><summary>Individual evidence and coverage</summary>
        {report.students.map(s=><div key={s.enrollmentId} className="border-t py-2 text-sm">
          <p className="font-medium">{workspace.roster.find(r=>r.enrollmentId===s.enrollmentId)?.name??s.enrollmentId} · {s.variantId??"No paper"} · {s.status}</p>
          <p>Grade revision: {s.gradeRevision??"—"} · Sample review: {s.sampleOutcome??"Not sampled"}</p>
          {s.evidence.map(e=><p key={e.cloCode+":"+e.role}>{e.cloCode} · {e.role}: {e.percentage===null?e.state:e.earnedPoints+"/"+e.plannedMaximum+" ("+percent(e.percentage)+")"}</p>)}
        </div>)}
      </details>
      <p className="break-all text-xs text-muted-foreground">{report.calculationVersion} · {report.calculationHash}</p>
    </div>}
  </section>;
}
