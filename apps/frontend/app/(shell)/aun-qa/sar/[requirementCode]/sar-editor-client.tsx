"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Database,
  FileCheck2,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import type {
  QaContributorWorkspaceView,
  QaDashboardView,
  QaEvidenceItemView,
  QaKnowledgeView,
  QaSarBlock,
  QaSarSectionView,
  QaSarSubmissionView,
} from "@dse-pms/shared-types";
import { DocumentRenderer, RichTextEditor } from "@/components/document-editor";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  newQaSarRichTextBlock,
  qaSarDocumentToEditorBlocks,
  qaSarEditorBlocksToDocument,
  type QaSarEditorBlock,
} from "@/lib/qa-sar-rich-content";

const PROGRAMME_ID = "dse";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusLabel(status: QaSarSectionView["status"]): string {
  return {
    notStarted: "Not started",
    drafting: "Drafting",
    readyForReview: "Ready for review",
    underReview: "Under review",
    changesRequested: "Changes requested",
    approved: "Approved",
  }[status];
}

export function SarEditorClient({ requirementCode }: { requirementCode: string }) {
  const { me, loading: meLoading } = useMe();
  const [section, setSection] = useState<QaSarSectionView | null>(null);
  const [submissions, setSubmissions] = useState<QaSarSubmissionView[]>([]);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [editorBlocks, setEditorBlocks] = useState<QaSarEditorBlock[]>([]);
  const [evidence, setEvidence] = useState<QaEvidenceItemView[]>([]);
  const [knowledge, setKnowledge] = useState<QaKnowledgeView | null>(null);
  const [readiness, setReadiness] = useState({
    practiceDescribed: false,
    resultsAnalysed: false,
    improvementExplained: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const content = useMemo(() => qaSarEditorBlocksToDocument(editorBlocks), [editorBlocks]);
  const leadershipOrReviewer =
    me?.roles.some((role) => ["admin", "program_coordinator", "qa_reviewer"].includes(role)) ?? false;
  const roleCanEdit =
    me?.roles.some((role) => ["admin", "program_coordinator", "qa_contributor"].includes(role)) ?? false;

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      let selectedCycleId: string | null = null;
      if (leadershipOrReviewer) {
        const dashboard = await api.get<QaDashboardView>(`/api/qa/dashboard?${params}`);
        selectedCycleId = dashboard.selectedCycle?.id ?? null;
      } else {
        const workspace = await api.get<QaContributorWorkspaceView>(`/api/qa/workspace/my-work?${params}`);
        selectedCycleId = workspace.selectedCycle?.id ?? null;
      }
      setCycleId(selectedCycleId);
      if (!selectedCycleId) return;

      const [sectionView, library, knowledgeView] = await Promise.all([
        api.get<QaSarSectionView>(
          `/api/qa/cycles/${selectedCycleId}/requirements/${requirementCode}/sar-section?${params}`,
        ),
        api.get<QaEvidenceItemView[]>(`/api/qa/evidence-library?${params}`),
        api.get<QaKnowledgeView>("/api/qa/knowledge"),
      ]);
      setSection(sectionView);
      setEditorBlocks(qaSarDocumentToEditorBlocks(sectionView.content));
      setReadiness(sectionView.readiness);
      setEvidence(library);
      setKnowledge(knowledgeView);

      if (sectionView.id) {
        setSubmissions(
          await api.get<QaSarSubmissionView[]>(
            `/api/qa/cycles/${selectedCycleId}/requirements/${requirementCode}/sar-submissions?${params}`,
          ),
        );
      } else {
        setSubmissions([]);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the SAR section");
    } finally {
      setLoading(false);
    }
  }, [leadershipOrReviewer, me, requirementCode]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [load, me, meLoading]);

  const mappedEvidence = useMemo(
    () =>
      evidence.filter((item) =>
        item.mappings.some(
          (mapping) => mapping.cycleId === cycleId && mapping.requirementCode === requirementCode,
        ),
      ),
    [cycleId, evidence, requirementCode],
  );

  const expectations = useMemo(
    () => knowledge?.expectations.filter((item) => item.requirementCode === requirementCode) ?? [],
    [knowledge, requirementCode],
  );

  const latestSubmission = submissions[0] ?? null;
  const latestReview = latestSubmission?.reviews.at(-1) ?? null;
  const editable = Boolean(
    roleCanEdit &&
      section &&
      ["notStarted", "drafting", "changesRequested"].includes(section.status),
  );

  function updateRichText(id: string, document: Extract<QaSarEditorBlock, { type: "richText" }>["document"]) {
    setEditorBlocks((current) =>
      current.map((block) => (block.id === id && block.type === "richText" ? { ...block, document } : block)),
    );
  }

  function removeBlock(id: string) {
    setEditorBlocks((current) => {
      const blocks = current.filter((block) => block.id !== id);
      return blocks.length ? blocks : [newQaSarRichTextBlock()];
    });
  }

  function continueWriting() {
    setEditorBlocks((current) =>
      current.at(-1)?.type === "richText" ? current : [...current, newQaSarRichTextBlock()],
    );
  }

  function insertEvidence(item: QaEvidenceItemView) {
    setEditorBlocks((current) => [
      ...current,
      { id: newId(), type: "evidenceReference", evidenceId: item.id, label: item.title },
    ]);
  }

  function insertPmsData(
    source: Extract<QaSarBlock, { type: "pmsData" }>["source"],
    label: string,
  ) {
    setEditorBlocks((current) => [...current, { id: newId(), type: "pmsData", source, label }]);
  }

  async function saveDraft(): Promise<QaSarSectionView | null> {
    if (!cycleId || !editable) return null;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.put<QaSarSectionView>(
        `/api/qa/cycles/${cycleId}/requirements/${requirementCode}/sar-section`,
        { programmeId: PROGRAMME_ID, content, readiness },
      );
      setSection(saved);
      setEditorBlocks(qaSarDocumentToEditorBlocks(saved.content));
      setReadiness(saved.readiness);
      return saved;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save SAR draft");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function submitForReview() {
    if (!cycleId || !editable) return;
    setSubmitting(true);
    setError(null);
    try {
      const saved = await api.put<QaSarSectionView>(
        `/api/qa/cycles/${cycleId}/requirements/${requirementCode}/sar-section`,
        { programmeId: PROGRAMME_ID, content, readiness },
      );
      if (!saved.plainText.trim()) {
        setError("Write SAR narrative content before submitting for review.");
        return;
      }
      await api.post<QaSarSubmissionView>(
        `/api/qa/cycles/${cycleId}/requirements/${requirementCode}/sar-section/submit`,
        { programmeId: PROGRAMME_ID },
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not submit SAR section for review");
    } finally {
      setSubmitting(false);
    }
  }

  async function createRevision() {
    if (!cycleId || !roleCanEdit || section?.status !== "approved") return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        `/api/qa/cycles/${cycleId}/requirements/${requirementCode}/sar-section/revise`,
        { programmeId: PROGRAMME_ID },
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create a new SAR revision");
    } finally {
      setSubmitting(false);
    }
  }

  if (meLoading || loading) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">Loading SAR editor…</div>;
  }

  if (!cycleId || !section) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">No accessible assessment cycle or SAR assignment was found.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {latestReview ? (
        <div className={`rounded-xl border p-4 text-sm ${latestReview.decision === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <div className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4" /> Latest reviewer decision</div>
          <p className="mt-1">{latestReview.decision === "approved" ? "Approved" : latestReview.decision === "moreEvidenceRequested" ? "More evidence requested" : "Changes requested"} by {latestReview.reviewer.name}.</p>
          {latestReview.comment ? <p className="mt-2">{latestReview.comment}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div>
          <div className="text-sm font-semibold text-primary">{section.requirementCode} · Criterion {section.criterionCode}</div>
          <h2 className="text-lg font-semibold">{section.requirementTitle}</h2>
          <div className="mt-1 text-xs text-muted-foreground">
            {statusLabel(section.status)}
            {latestSubmission ? ` · submission v${latestSubmission.version}` : ""}
            {section.updatedByName ? ` · last edited by ${section.updatedByName}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/aun-qa" className="rounded-md border px-3 py-2 text-sm">Workspace</Link>
          {me?.permissions.includes("qa:review") ? <Link href="/aun-qa/review" className="rounded-md border px-3 py-2 text-sm">Review queue</Link> : null}
          {editable ? (
            <>
              <button onClick={() => void saveDraft()} disabled={saving || submitting} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save draft"}</button>
              <button onClick={() => void submitForReview()} disabled={saving || submitting} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" />{submitting ? "Submitting…" : "Submit for review"}</button>
            </>
          ) : null}
          {roleCanEdit && section.status === "approved" ? (
            <button onClick={() => void createRevision()} disabled={submitting} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"><RotateCcw className="h-4 w-4" />Create revision</button>
          ) : null}
        </div>
      </div>

      {section.status === "underReview" ? <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">This snapshot is under human review. The working section is read-only until the reviewer approves it or requests changes.</div> : null}
      {section.status === "approved" ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">This approved snapshot is frozen for official SAR assembly. Create a revision to continue editing without changing the approved version.</div> : null}

      <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)_320px]">
        <aside className="rounded-xl border bg-white p-4 xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-center gap-2 font-semibold"><BookOpen className="h-4 w-4" /> Guidance</div>
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expectation</div>
              {expectations.length ? expectations.map((item) => <p key={item.id} className="mt-2 text-muted-foreground">{item.statement}</p>) : <p className="mt-2 text-muted-foreground">Address the requirement using current programme practice, evidence, interpretation, and improvement actions.</p>}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Questions to consider</div>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>What is the current practice or process?</li>
                <li>Who is involved and how is it implemented?</li>
                <li>What evidence supports the important claims?</li>
                <li>What do the results or findings indicate?</li>
                <li>What changed or should improve?</li>
              </ul>
            </div>
            <div className="space-y-2 border-t pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Author readiness</div>
              {([
                ["practiceDescribed", "Practice/process described"],
                ["resultsAnalysed", "Results/findings analysed"],
                ["improvementExplained", "Improvement/action explained"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={readiness[key]} disabled={!editable} onChange={(event) => setReadiness((current) => ({ ...current, [key]: event.target.checked }))} className="mt-1" /><span>{label}</span></label>
              ))}
            </div>
          </div>
        </aside>

        <section className="rounded-xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <span className="text-xs font-medium text-muted-foreground">DSE Content Editor</span>
            <div className="mx-1 h-5 border-l" />
            <button disabled={!editable} onClick={() => insertPmsData("cloAttainment", "CLO attainment summary")} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"><Database className="h-3 w-3" /> CLO attainment</button>
            <button disabled={!editable} onClick={() => insertPmsData("assessmentSummary", "Assessment results summary")} className="rounded-md border px-2.5 py-1.5 text-xs">Assessment data</button>
          </div>

          <div className="min-h-[650px] space-y-3 p-5 md:p-8">
            {editorBlocks.map((block) => (
              <div key={block.id} className="group relative rounded-lg">
                {block.type === "richText" ? (
                  editable ? (
                    <RichTextEditor
                      value={block.document}
                      onChange={(document) => updateRichText(block.id, document)}
                      minHeight={220}
                    />
                  ) : (
                    <div className="rounded-lg border bg-white p-4">
                      <DocumentRenderer value={block.document} />
                    </div>
                  )
                ) : block.type === "evidenceReference" ? (
                  <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800"><FileCheck2 className="h-4 w-4" /> Evidence: {block.label}</div>
                ) : (
                  <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800"><Database className="h-4 w-4" /> PMS data: {block.label}</div>
                )}
                {editable && block.type !== "richText" ? <button onClick={() => removeBlock(block.id)} className="absolute right-1 top-1 hidden rounded p-1 text-muted-foreground hover:bg-white group-hover:block" aria-label="Remove block"><Trash2 className="h-3.5 w-3.5" /></button> : null}
              </div>
            ))}
            {editable ? <button onClick={continueWriting} className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /> Continue writing</button> : null}
          </div>
        </section>

        <aside className="rounded-xl border bg-white p-4 xl:sticky xl:top-4 xl:self-start">
          <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 font-semibold"><FileCheck2 className="h-4 w-4" /> Evidence</div><Link href="/aun-qa/evidence" className="text-xs font-medium text-primary hover:underline">Library</Link></div>
          <p className="mt-2 text-xs text-muted-foreground">Only evidence already mapped to {requirementCode} can be inserted.</p>
          <div className="mt-4 space-y-2">
            {mappedEvidence.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="text-sm font-medium">{item.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{item.reportingPeriod || item.kind} · {item.status}</div>
                {editable ? <button onClick={() => insertEvidence(item)} className="mt-2 w-full rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-muted">Insert evidence reference</button> : null}
              </div>
            ))}
            {mappedEvidence.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">No evidence mapped yet. Add or reuse evidence from the Evidence Library first.</div> : null}
          </div>

          {submissions.length > 0 ? (
            <div className="mt-5 border-t pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submission history</div>
              <div className="mt-2 space-y-2">
                {submissions.map((submission) => (
                  <div key={submission.id} className="rounded-lg bg-slate-50 p-2 text-xs">
                    <div className="font-medium">Version {submission.version}</div>
                    <div className="text-muted-foreground">Submitted by {submission.submittedBy.name}</div>
                    <div className="text-muted-foreground">{submission.reviews.length} review decision{submission.reviews.length === 1 ? "" : "s"}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
