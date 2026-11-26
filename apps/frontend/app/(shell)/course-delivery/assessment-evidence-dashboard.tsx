"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input } from "@dse-pms/ui";
import { api, ApiError } from "@/lib/api";
import { protectedQueryKey } from "@/lib/query-client";
import type { EvidencePopulation, EvidenceSelection } from "./assessment-evidence-panel";

type Programme = { id: string; code: string; name: string };
type Coverage = { assessmentItemId: string; name: string; population: EvidencePopulation; eligibleCount: number;
  target: number; gap: number; draft: number; submitted: number; verified: number; changesRequested: number; stale: number; collected: number;
  state: "not_ready" | "target_met" | "evidence_needed" };
type OfferingRow = { offeringId: string; code: string; title: string; sectionCode: string; status: string;
  lecturerName: string | null; courseSpecId: string | null; specificationStatus: string | null; assessments: Coverage[] };
type Dashboard = { programmeId: string; term: string; page: number; pageSize: number; totalOfferings: number; rows: OfferingRow[] };
const root = "/api/qa/assessment-evidence/programmes";
const selectStyle = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
function message(error: unknown) { return error instanceof ApiError ? error.message : "Could not load evidence coverage."; }
const label = (p: EvidencePopulation) => p === "group" ? "Shared group work" : p === "component" ? "Individual contribution" : "Individual work";

export function AssessmentEvidenceDashboard({ userId, onOpen }: { userId: string; onOpen: (selection: EvidenceSelection) => void }) {
  const [programme, setProgramme] = useState("");
  const programmes = useQuery({ queryKey: protectedQueryKey({ userId }, "assessment-evidence", "programme-options"),
    queryFn: () => api.get<Programme[]>(root), staleTime: 0, gcTime: 0, retry: false });
  if (programmes.isError) return <p role="alert" className="text-sm text-destructive">{message(programmes.error)}</p>;
  if (!programmes.data) return <p className="text-sm text-muted-foreground">Loading authorised programmes…</p>;
  const selected = programmes.data.find(x => x.id === programme) ?? programmes.data[0];
  return <section className="rounded-xl border border-border bg-card p-4 space-y-4">
    <h2 className="text-lg font-semibold">Programme assessment evidence</h2>
    <p className="text-sm text-muted-foreground">Internal sample coverage, not an AUN-QA score. The proposed target is up to three verified samples per eligible assessment population. No finalized marks means not ready, not complete. Major-assessment applicability requires coordinator review.</p>
    {!selected ? <p>No authorised programme.</p> : <>
      <label className="block text-sm font-medium">Programme<select aria-label="Programme" className={selectStyle} value={selected.id} onChange={e => setProgramme(e.target.value)}>{programmes.data.map(p => <option value={p.id} key={p.id}>{p.code} — {p.name}</option>)}</select></label>
      <ProgrammeCoverage key={selected.id} programmeId={selected.id} userId={userId} onOpen={onOpen} />
    </>}
  </section>;
}
function ProgrammeCoverage({ programmeId, userId, onOpen }: { programmeId: string; userId: string; onOpen: (selection: EvidenceSelection) => void }) {
  const [term, setTerm] = useState("");
  const terms = useQuery({ queryKey: protectedQueryKey({ userId, programmeId }, "assessment-evidence", "terms"),
    queryFn: () => api.get<string[]>(root + "/" + encodeURIComponent(programmeId) + "/terms"), staleTime: 0, gcTime: 0, retry: false });
  if (terms.isError) return <p role="alert" className="text-sm text-destructive">{message(terms.error)}</p>;
  if (!terms.data) return <p className="text-sm text-muted-foreground">Loading terms…</p>;
  const selected = terms.data.includes(term) ? term : terms.data[0];
  if (!selected) return <p>No offerings recorded in this programme.</p>;
  return <>
    <label className="block text-sm font-medium">Term<select aria-label="Term" className={selectStyle} value={selected} onChange={e => setTerm(e.target.value)}>{terms.data.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
    <CoveragePage key={selected} programmeId={programmeId} term={selected} userId={userId} onOpen={onOpen} />
  </>;
}
function CoveragePage({ programmeId, term, userId, onOpen }: { programmeId: string; term: string; userId: string; onOpen: (selection: EvidenceSelection) => void }) {
  const [page,setPage] = useState(1);
  const [input,setInput] = useState("");
  const [search,setSearch] = useState("");
  const query = useQuery({ queryKey: protectedQueryKey({ userId, programmeId }, "assessment-evidence", "dashboard", term, search, page),
    queryFn: () => api.get<Dashboard>(root + "/" + encodeURIComponent(programmeId) + "/dashboard?" + new URLSearchParams({ term, page: String(page), search }).toString()),
    staleTime: 0, gcTime: 0, retry: false });
  const data = query.data;
  const populations = data?.rows.flatMap(row => row.assessments) ?? [];
  return <div className="space-y-3">
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); setSearch(input.trim()); setPage(1); }}>
      <label className="flex-1 text-sm font-medium">Course code or title<Input value={input} maxLength={100} onChange={e => setInput(e.target.value)} /></label><Button type="submit" variant="outline">Search</Button>
      <Button type="button" variant="outline" onClick={() => void query.refetch()}>Refresh</Button>
    </form>
    {query.isError ? <p role="alert" className="text-sm text-destructive">{message(query.error)}</p> : !data ? <p className="text-sm text-muted-foreground">Loading evidence coverage…</p> : <>
      <p className="text-sm">Matching offerings: <strong>{data.totalOfferings}</strong> · page {data.page} of {Math.max(1, Math.ceil(data.totalOfferings / data.pageSize))}</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[["Verified (page)",populations.reduce((n,x)=>n+x.verified,0)],["Awaiting review (page)",populations.reduce((n,x)=>n+x.submitted,0)],["Stale (page)",populations.reduce((n,x)=>n+x.stale,0)],["Sample gap (page)",populations.reduce((n,x)=>n+x.gap,0)]].map(([title,count])=><div key={title} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{title}</p><p className="text-xl font-semibold">{count}</p></div>)}
      </div>
      {data.rows.map(row => <article className="rounded-lg border border-border p-3 space-y-2" key={row.offeringId}>
        <h3 className="font-semibold">{row.code} — {row.title} · {row.sectionCode}</h3>
        <p className="text-xs text-muted-foreground">{row.lecturerName ?? "No assigned lecturer"} · {row.status}</p>
        {!row.courseSpecId ? <p className="text-sm">Not ready — no exact approved CourseSpec ({row.specificationStatus ?? "missing"}).</p> : !row.assessments.length ? <p className="text-sm">No active assessments.</p> : row.assessments.map(a => <div key={a.assessmentItemId + ":" + a.population} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{a.name} · {label(a.population)}</p>
            <p className="text-xs text-muted-foreground">{a.state === "not_ready" ? "Not ready: no eligible finalized marks" : a.verified + "/" + a.target + " verified · " + a.gap + " gap"} · {a.collected} collected · {a.submitted} submitted · {a.draft} drafts · {a.changesRequested} changes requested · {a.stale} stale</p>
          </div><Button variant="outline" onClick={() => onOpen({ offeringId: row.offeringId, assessmentItemId: a.assessmentItemId, population: a.population })}>Open evidence</Button>
        </div>)}
      </article>)}
      {!data.rows.length && <p>No matching offerings.</p>}
      <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</Button><Button variant="outline" disabled={page*data.pageSize>=data.totalOfferings} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
    </>}
  </div>;
}
