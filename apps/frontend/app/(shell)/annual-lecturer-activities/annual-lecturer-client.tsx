"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AnnualLecturer, AnnualSummary, AnnualYear } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { lecturersApi } from "@/lib/lecturers";

function message(error:unknown):string {
  return error instanceof ApiError ? error.message :
    error instanceof Error ? error.message : "Annual activity request failed";
}
function download(filename:string,body:string,mime:string):void {
  const url=URL.createObjectURL(new Blob([body],{type:mime}));
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);
  anchor.click();anchor.remove();URL.revokeObjectURL(url);
}
export function AnnualLecturerClient(){
  const {me}=useMe();
  const coordinator=Boolean(me?.roles.some(r=>r==="admin"||r==="program_coordinator"));
  const [years,setYears]=useState<AnnualYear[]>([]);
  const [yearId,setYearId]=useState("");
  const [summary,setSummary]=useState<AnnualSummary|null>(null);
  const [own,setOwn]=useState<AnnualLecturer|null>(null);
  const [portfolio,setPortfolio]=useState<Array<{id:string;title:string;kind:string}>>([]);
  const [selectedEvidence,setSelectedEvidence]=useState("");
  const [expanded,setExpanded]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  useEffect(()=>{
    let active=true;
    lecturersApi.annualYears().then(result=>{
      if(!active)return;
      setYears(result);setYearId(current=>current||result[0]?.id||"");
    }).catch(e=>{if(active)setError(message(e));})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);

  const reload=useCallback(async()=>{
    if(!yearId)return;
    setLoading(true);setError(null);
    try{
      if(coordinator){
        const result=await lecturersApi.annualSummary(yearId);
        setSummary(result);
      }else{
        const [result,items]=await Promise.all([
          lecturersApi.annualMe(yearId),lecturersApi.portfolioItems(),
        ]);
        setOwn(result.staff);
        setPortfolio(items.map(i=>({id:i.id,title:i.title,kind:i.kind})));
      }
    }catch(e){setError(message(e));}
    finally{setLoading(false);}
  },[coordinator,yearId]);

  useEffect(()=>{void reload();},[reload]);

  async function perform(action:()=>Promise<unknown>,success:string){
    setSaving(true);setError(null);setNotice(null);
    try{await action();setNotice(success);await reload();}
    catch(e){setError(message(e));}
    finally{setSaving(false);}
  }

  async function reviewTeaching(lecturerId:string,offeringId:string,verdict:"confirmed"|"not_delivered"){
    const reason=window.prompt("Evidence or reason for the teaching decision (required):");
    if(!reason || reason.trim().length<5)return;
    const evidenceUrl=window.prompt("Supporting evidence URL (optional):")??"";
    await perform(()=>lecturersApi.annualReviewTeaching(yearId,
      {lecturerId,offeringId,verdict,reason:reason.trim(),evidenceUrl}),
      "Teaching review recorded with an audit event.");
  }

  async function reviewEvidence(lecturerId:string,itemId:string,action:"verified"|"rejected"){
    const note=window.prompt("Review note / evidence checked:");
    if(note===null)return;
    await perform(()=>lecturersApi.reviewPortfolioItem(lecturerId,itemId,
      {action,note:note.trim()}),"Professional evidence review saved.");
  }

  async function exportFile(type:"csv"|"excel"){
    setSaving(true);setError(null);
    try{
      const report=await lecturersApi.annualExport(yearId);
      const base="dse-annual-staff-"+report.academicYear+"-v"+report.version;
      if(type==="csv")download(base+".csv",report.csv,"text/csv;charset=utf-8");
      else download(base+".xml",report.excelXml,"application/vnd.ms-excel;charset=utf-8");
    }catch(e){setError(message(e));}
    finally{setSaving(false);}
  }

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold text-foreground">Academic-year evidence</h2>
        <p className="text-sm text-muted-foreground">Verified contributions are counted once per year; missing submissions are not zero.</p>
      </div>
      <label className="text-sm text-muted-foreground">Academic year
        <select aria-label="Academic year" className="ml-2 rounded-md border border-border bg-background px-3 py-2 text-foreground"
          value={yearId} onChange={e=>setYearId(e.target.value)}>
          {years.map(year=><option key={year.id} value={year.id}>{year.label}</option>)}
        </select>
      </label>
    </header>
    {error&&<p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="rounded-lg border border-border bg-card p-3 text-sm text-foreground">{notice}</p>}
    {loading&&<p className="text-sm text-muted-foreground">Loading annual evidence…</p>}
    {!loading&&!yearId&&<p className="text-sm text-muted-foreground">No programme academic year has been configured.</p>}
    {!loading&&yearId&&coordinator&&summary&&<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Teaching active",summary.statistics.activeTeaching],
          ["Other contributors",summary.statistics.otherContributors],
          ["Unreported",summary.statistics.unreported],
          ["Distinct publications",summary.statistics.distinctPublications],
        ].map(([label,value])=>
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={saving}
          onClick={()=>{if(window.confirm("Release an immutable annual report snapshot from the currently verified records?"))
            void perform(()=>lecturersApi.annualRelease(yearId),"Annual report version released.");}}>
          Release reviewed snapshot
        </button>
        <button className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={saving}
          onClick={()=>void exportFile("csv")}>Export CSV</button>
        <button className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={saving}
          onClick={()=>void exportFile("excel")}>Export Excel XML</button>
      </div>
      <p className="text-xs text-muted-foreground">Exports use the latest immutable release; all teaching, item, and review source IDs are included. Pending and contradictory records remain marked for follow-up.</p>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>{["Lecturer","Employment","Annual status","Submission","Confirmed sections","Verified activities","Details"].map(label=>
              <th key={label} className="px-3 py-3">{label}</th>)}</tr>
          </thead>
          <tbody>
            {summary.staff.map(person=><tr key={person.lecturerId} className="border-t border-border align-top">
              <td className="px-3 py-3 font-medium">{person.name}</td>
              <td className="px-3 py-3">{person.employmentType??"Unknown"}</td>
              <td className="px-3 py-3">{person.classification.replace(/_/g," ")}</td>
              <td className="px-3 py-3">{person.submissionStatus}</td>
              <td className="px-3 py-3">{person.teaching.filter(t=>t.confirmed).length}</td>
              <td className="px-3 py-3">{person.verifiedActivityCount}</td>
              <td className="px-3 py-3">
                <button className="text-primary underline" onClick={()=>setExpanded(expanded===person.lecturerId?null:person.lecturerId)}>
                  {expanded===person.lecturerId?"Hide":"Review"}
                </button>
                {expanded===person.lecturerId&&<div className="mt-3 min-w-[290px] space-y-3">
                  {person.teaching.map(t=><div key={t.offeringId} className="rounded-lg border border-border p-2">
                    <p className="font-medium">{t.courseCode} · {t.term} · {t.sectionCode}</p>
                    <p className="text-xs text-muted-foreground">{t.confirmed?"Delivery confirmed":"Assigned, unconfirmed"}
                      {t.discrepancy?" · conflicting records":""} · Sessions: {t.deliveredSessions}</p>
                    <div className="mt-2 flex gap-2">
                      <button disabled={saving} className="text-xs text-primary underline" onClick={()=>void reviewTeaching(person.lecturerId,t.offeringId,"confirmed")}>Confirm</button>
                      <button disabled={saving} className="text-xs text-primary underline" onClick={()=>void reviewTeaching(person.lecturerId,t.offeringId,"not_delivered")}>Not delivered</button>
                    </div>
                  </div>)}
                  {person.evidence.map(item=><div key={item.id} className="rounded-lg border border-border p-2">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.kind} · {item.verificationStatus}</p>
                    {item.url&&<a className="text-xs text-primary underline" href={item.url} rel="noopener noreferrer" target="_blank">Evidence link</a>}
                    <div className="mt-1 flex gap-2">
                      <button disabled={saving||person.lecturerId===me?.id} className="text-xs text-primary underline"
                        onClick={()=>void reviewEvidence(person.lecturerId,item.id,"verified")}>Verify</button>
                      <button disabled={saving||person.lecturerId===me?.id} className="text-xs text-primary underline"
                        onClick={()=>void reviewEvidence(person.lecturerId,item.id,"rejected")}>Reject</button>
                    </div>
                  </div>)}
                  {!person.teaching.length&&!person.evidence.length&&<p className="text-xs text-muted-foreground">No annual evidence linked.</p>}
                </div>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </>}
    {!loading&&yearId&&!coordinator&&<section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold">My annual contribution</h3>
      <p className="text-sm text-muted-foreground">Your assignments come from PMS. Link existing portfolio records for this reporting year; the coordinator verifies contributions.</p>
      <p className="text-sm">Annual status: <strong>{own?.classification.replace(/_/g," ")??"Not recorded"}</strong> · Submission: <strong>{own?.submissionStatus??"unreported"}</strong></p>
      <div className="space-y-2">
        {(own?.teaching??[]).map(t=><p key={t.offeringId} className="rounded-lg bg-muted/50 p-3 text-sm">
          {t.courseCode} — {t.courseTitle} · {t.term} · {t.confirmed?"Confirmed":"Pending delivery verification"}
        </p>)}
      </div>
      <Link href="/lecturer-portfolio/evidence" className="text-sm text-primary underline">Add or edit professional evidence in My Portfolio</Link>
      <div className="flex flex-wrap gap-2">
        <select className="min-w-48 rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={selectedEvidence} onChange={e=>setSelectedEvidence(e.target.value)}>
          <option value="">Choose a portfolio activity</option>
          {portfolio.map(item=><option key={item.id} value={item.id}>{item.title} · {item.kind}</option>)}
        </select>
        <button disabled={saving||!selectedEvidence}
          className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50"
          onClick={()=>void perform(()=>lecturersApi.annualLinkEvidence(yearId,selectedEvidence),"Evidence linked to this academic year.")}>
          Link activity
        </button>
      </div>
      <div className="space-y-2">
        {(own?.evidence??[]).map(item=><p key={item.id} className="text-sm">
          {item.title} — <span className="text-muted-foreground">{item.verificationStatus}</span>
        </p>)}
      </div>
      <button disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        onClick={()=>void perform(()=>lecturersApi.annualSubmit(yearId),"Annual submission recorded. Activities await coordinator verification.")}>
        Submit annual activities
      </button>
    </section>}
  </div>;
}
