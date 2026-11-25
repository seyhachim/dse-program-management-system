"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CourseDeliveryOffering } from "@dse-pms/shared-types";
import { Button, Input } from "@dse-pms/ui";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { protectedQueryKey } from "@/lib/query-client";

type Context = { courseSpecId: string; assessments: { id: string; name: string; mode: string }[] };
type Attachment = { filename: string; mimeType: string; sizeBytes: number; sha256: string };
type Revision = {
  id: string; resultId: string; revision: number; status: string; effectiveStatus?: string;
  workReference: string | null; attachment: Attachment | null; selectionReason: string;
  reviewReason: string | null; actorId: string; createdAt: string; score: number; maxScore: number;
};
type Overview = {
  access: { contribute: boolean; review: boolean };
  suggestions: { eligibleCount: number; suggestions: { sourceId: string; rank: string; percentage: number; tied: boolean }[] };
  eligibleResults: { resultId: string; enrollmentId: string; score: number; maxScore: number; feedbackAvailable: boolean }[];
  evidence: Revision[];
};
function message(error: unknown) { return error instanceof ApiError ? error.message : "Evidence operation failed. Please reload and retry."; }
const selectStyle = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
const panelStyle = "rounded-xl border border-border bg-card p-4 space-y-3";

export function AssessmentEvidencePanel({ offering }: { offering: CourseDeliveryOffering }) {
  const { me } = useMe();
  const root = "/api/qa/assessment-evidence/offerings/" + encodeURIComponent(offering.offeringId);
  const context = useQuery({
    queryKey: protectedQueryKey({ userId: me?.id ?? "pending" }, "assessment-evidence", offering.offeringId, "context"),
    queryFn: () => api.get<Context>(root + "/context"),
    enabled: !!me?.id, staleTime: 0, gcTime: 0, retry: false,
  });
  if (context.isError) return <section className={panelStyle}><h2 className="font-semibold">Assessment Evidence</h2><p role="alert" className="text-sm text-destructive">{message(context.error)}</p><Button variant="outline" onClick={() => void context.refetch()}>Retry</Button></section>;
  if (!context.data) return <p className="text-sm text-muted-foreground">Loading authorized assessment context…</p>;
  return <EvidenceAssessmentPicker key={(me?.id ?? "pending") + ":" + offering.offeringId + ":" + context.data.courseSpecId} offering={offering} context={context.data} root={root} userId={me?.id ?? "pending"} />;
}
function EvidenceAssessmentPicker({ offering, context, root, userId }: { offering: CourseDeliveryOffering; context: Context; root: string; userId: string }) {
  const [selected, setSelected] = useState(context.assessments.find(x => x.mode === "Individual")?.id ?? "");
  const assessment = context.assessments.find(x => x.id === selected);
  const deliveryAssessment = offering.assessments.find(x => x.id === selected);
  return <section className={panelStyle}>
    <h2 className="text-lg font-semibold">Assessment Evidence</h2>
    <p className="text-sm text-muted-foreground">Private marked work for AUN-QA. Suggested samples are relative ranks, not official achievement levels. Only published and finalized individual marks are eligible.</p>
    <label className="block text-sm font-medium">Assessment
      <select className={selectStyle} value={selected} onChange={e => setSelected(e.target.value)}>
        <option value="">Select assessment</option>
        {context.assessments.map(a => <option key={a.id} value={a.id}>{a.name}{a.mode !== "Individual" ? " (group evidence pending)" : ""}</option>)}
      </select>
    </label>
    {assessment?.mode === "Individual" ? <EvidenceRows key={assessment.id} base={root + "/specs/" + encodeURIComponent(context.courseSpecId) + "/assessments/" + encodeURIComponent(assessment.id)} userId={userId} students={deliveryAssessment?.results ?? []} /> :
      <p className="text-sm text-muted-foreground">{assessment ? "Group and individual-component evidence will use a separate workflow." : "Select an individual assessment to start."}</p>}
  </section>;
}
function EvidenceRows({ base, userId, students }: { base: string; userId: string; students: { enrollmentId: string; studentName: string; studentCode: string | null }[] }) {
  const [chosen, setChosen] = useState("");
  const query = useQuery({ queryKey: protectedQueryKey({ userId }, "assessment-evidence", base),
    queryFn: () => api.get<Overview>(base), staleTime: 0, gcTime: 0, retry: false });
  if (query.isError) return <div role="alert" className="space-y-2 text-sm"><p>{message(query.error)}</p><Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>;
  if (!query.data) return <p className="text-sm text-muted-foreground">Loading finalized results…</p>;
  const data = query.data;
  const studentLabel = (enrollmentId: string) => {
    const student = students.find(s => s.enrollmentId === enrollmentId);
    return student ? student.studentName + (student.studentCode ? " · " + student.studentCode : "") : "Enrolled student";
  };
  const current = data.eligibleResults.find(s => s.resultId === chosen);
  const revision = data.evidence.find(e => e.resultId === chosen);
  const verified = data.evidence.filter(e => e.effectiveStatus === "verified").length;
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[["Eligible marks",data.suggestions.eligibleCount],["Suggested",data.suggestions.suggestions.length],["Collected",data.evidence.filter(e => e.attachment || e.workReference).length],["Verified",verified]].map(([label,count]) =>
        <div key={label} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{count}</p></div>)}
    </div>
    <p className="text-xs text-muted-foreground">Submission status is unknown until you confirm actual marked work. Three samples is a proposed DSE convention, not an AUN-QA requirement.</p>
    {data.suggestions.suggestions.length > 0 && <div className="space-y-2"><h3 className="text-sm font-semibold">Suggested representative samples</h3>
      {data.suggestions.suggestions.map(s => {
        const result = data.eligibleResults.find(x => x.resultId === s.sourceId);
        return <button key={s.sourceId} type="button" onClick={() => setChosen(s.sourceId)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted">
          <span>{result ? studentLabel(result.enrollmentId) : "Student"} · {s.rank}{s.tied ? " (tied)" : ""}</span><span className="font-medium">{s.percentage.toFixed(1)}%</span>
        </button>;
      })}
    </div>}
    <label className="block text-sm font-medium">Choose eligible student
      <select className={selectStyle} value={chosen} onChange={e => setChosen(e.target.value)}>
        <option value="">Choose a student</option>
        {data.eligibleResults.map(s => <option key={s.resultId} value={s.resultId}>{studentLabel(s.enrollmentId)} — {s.score}/{s.maxScore}{data.evidence.find(e => e.resultId === s.resultId) ? " · evidence exists" : ""}</option>)}
      </select>
    </label>
    {!data.eligibleResults.length && <p className="text-sm text-muted-foreground">No eligible finalized results yet. Publish and finalize marks using the existing Results workflow.</p>}
    {current && <EvidenceEditor key={current.resultId + ":" + (revision?.revision ?? 0)} path={base + "/results/" + encodeURIComponent(current.resultId)} revision={revision} current={current} access={data.access} changed={async () => { await query.refetch(); }} />}
    {data.evidence.length > 0 && <div className="space-y-2"><h3 className="text-sm font-semibold">Collected evidence</h3>
      {data.evidence.map(e => { const result = data.eligibleResults.find(s => s.resultId === e.resultId); return <button key={e.resultId} type="button" disabled={!result} onClick={() => setChosen(e.resultId)} className="flex w-full justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60"><span>{result ? studentLabel(result.enrollmentId) : "Historical source unavailable"} · revision {e.revision}</span><span>{(e.effectiveStatus ?? e.status).replaceAll("_"," ")}</span></button>; })}
    </div>}
  </div>;
}
function EvidenceEditor({ path, revision, current, access, changed }: {
  path: string; revision?: Revision; current: Overview["eligibleResults"][number]; access: Overview["access"]; changed: () => Promise<void>;
}) {
  const [reason, setReason] = useState(revision?.selectionReason ?? "");
  const [reference, setReference] = useState(revision?.workReference ?? "");
  const [mode, setMode] = useState<"reference"|"file"|"retain">(revision?.attachment ? "retain" : "reference");
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [download, setDownload] = useState<{ url: string; expiresAt: number } | null>(null);
  const [history, setHistory] = useState<Revision[] | null>(null);
  const expectedRevision = revision?.revision ?? 0;
  const status = revision?.effectiveStatus ?? revision?.status;
  async function run(operation: () => Promise<unknown>, refresh = true) {
    setBusy(true); setError("");
    try { await operation(); if (refresh) await changed(); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  function save() {
    if (mode === "file") {
      if (!file || file.size > 5 * 1024 * 1024 || !["application/pdf","image/jpeg","image/png"].includes(file.type)) { setError("Choose a PDF, JPG or PNG up to 5 MiB."); return; }
      void run(() => api.uploadEvidenceFile(path + "/attachment", file, expectedRevision, reason.trim()));
    } else {
      void run(() => api.post(path + "/revisions", {
        action: expectedRevision ? "revise" : "create", expectedRevision, selectionReason: reason.trim(),
        workReference: mode === "reference" ? reference.trim() || null : null,
        ...(mode === "retain" && expectedRevision ? { keepAttachment: true } : {}),
      }));
    }
  }
  function prepareDownload() {
    if (!revision) return;
    void run(async () => {
      const response = await api.get<{ url: string; expiresInSeconds: number }>(path + "/revisions/" + revision.revision + "/download");
      if (new URL(response.url).protocol !== "https:") throw new Error("Invalid private download");
      setDownload({ url: response.url, expiresAt: Date.now() + response.expiresInSeconds * 1000 });
    }, false);
  }
  return <div className={panelStyle}>
    <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">Student evidence · {current.score}/{current.maxScore}</h3><span className="text-sm">{status?.replaceAll("_"," ") ?? "Not collected"}</span></div>
    <p className="text-xs text-muted-foreground">Official feedback {current.feedbackAvailable ? "available in Results" : "not recorded"}. Saving evidence never changes grades.</p>
    {revision?.reviewReason && <p className="text-sm">Review note: {revision.reviewReason}</p>}
    {revision?.workReference && <a href={revision.workReference} target="_blank" rel="noopener noreferrer" className="text-sm underline">Open restricted work reference</a>}
    {revision?.attachment && <div className="flex flex-wrap items-center gap-2 text-sm"><span>{revision.attachment.filename} · {Math.ceil(revision.attachment.sizeBytes / 1024)} KiB</span><Button variant="outline" disabled={busy} onClick={prepareDownload}>Prepare private download</Button>{download && <a className="underline" href={download.url} rel="noreferrer" target="_blank" onClick={e => { if (Date.now() >= download.expiresAt) { e.preventDefault(); setDownload(null); setError("Download expired. Prepare it again."); } }}>Download (60-second link)</a>}</div>}
    {access.contribute && <div className="space-y-3 border-t border-border pt-3">
      <label className="block text-sm font-medium">Sample selection reason<Input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} placeholder="Why this work is representative" disabled={busy} /></label>
      <label className="block text-sm font-medium">Evidence source<select className={selectStyle} value={mode} disabled={busy} onChange={e => setMode(e.target.value as typeof mode)}>{revision?.attachment && <option value="retain">Keep current private file</option>}<option value="reference">Restricted Drive / Docs / Colab link</option><option value="file">Upload PDF / JPG / PNG</option></select></label>
      {mode === "reference" && <Input type="url" value={reference} onChange={e => setReference(e.target.value)} placeholder="https://drive.google.com/file/d/…/view" disabled={busy} aria-label="Restricted evidence reference" />}
      {mode === "file" && <div className="space-y-1"><input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)} aria-label="Private marked work file" className="block max-w-full text-sm" /><p className="text-xs text-muted-foreground">Maximum 5 MiB. Files are scanned before private storage. Upload may be disabled until storage and scanning are configured.</p></div>}
      <Button disabled={busy || !reason.trim() || (mode === "file" && !file)} onClick={save}>{busy ? "Working…" : revision ? "Save new draft revision" : "Save draft"}</Button>
      {revision && status === "draft" && (revision.workReference || revision.attachment) && <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm this is actual marked student work and its access is restricted.</label>
        <Button disabled={busy || !confirmed} onClick={() => void run(() => api.post(path + "/revisions", { action: "submit", expectedRevision, confirmedMarkedWork: true }))}>Submit for verification</Button>
      </div>}
    </div>}
    {access.review && revision && status === "submitted" && <div className="space-y-2 border-t border-border pt-3">
      <label className="block text-sm font-medium">Review reason<Input value={reviewReason} maxLength={500} onChange={e => setReviewReason(e.target.value)} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked the restricted work and official marks.</label>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !confirmed || !reviewReason.trim()} onClick={() => void run(() => api.post(path + "/revisions", { action: "verify", expectedRevision, reviewReason, confirmedRestrictedWorkAndMarks: true }))}>Verify</Button><Button variant="outline" disabled={busy || !reviewReason.trim()} onClick={() => void run(() => api.post(path + "/revisions", { action: "request_changes", expectedRevision, reviewReason }))}>Request changes</Button></div>
    </div>}
    {revision && <Button variant="outline" disabled={busy} onClick={() => void run(async () => { const h = await api.get<{ revisions: Revision[] }>(path + "/history"); setHistory(h.revisions); }, false)}>View recent revision history</Button>}
    {history && <div className="space-y-1 text-xs">{history.map(h => <p key={h.id}>Revision {h.revision} · {h.status.replaceAll("_"," ")} · {new Date(h.createdAt).toLocaleString()} {h.reviewReason ? "· " + h.reviewReason : ""}</p>)}</div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
