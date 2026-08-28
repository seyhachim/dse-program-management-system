"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  QaContributorWorkspaceView,
  QaDashboardView,
  QaEvidenceItemView,
  QaSarBookAppendixGroup,
  QaSarBookEvidenceRegisterView,
  QaSarBookNarrativeSectionView,
  QaSarBookSection,
  QaSarBookSectionEvidenceReferenceView,
  QaSarBookTerminology,
  QaSarBookView,
} from "@dse-pms/shared-types";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { SAR_BOOK_MODE_HREFS } from "../sar-book-navigation";

const PROGRAMME_ID = "dse";
const APPENDIX_GROUPS: Array<{ value: QaSarBookAppendixGroup; label: string }> = [
  { value: "programme", label: "Programme" },
  { value: "curriculum", label: "Curriculum" },
  { value: "teachingLearning", label: "Teaching & Learning" },
  { value: "assessment", label: "Assessment" },
  { value: "staff", label: "Staff" },
  { value: "studentSupport", label: "Student Support" },
  { value: "facilities", label: "Facilities" },
  { value: "outcomes", label: "Outcomes" },
  { value: "governance", label: "Governance" },
  { value: "other", label: "Other" },
];

export function SarBookEvidenceClient() {
  const { me, loading: meLoading } = useMe();
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [book, setBook] = useState<QaSarBookView | null>(null);
  const [register, setRegister] = useState<QaSarBookEvidenceRegisterView | null>(null);
  const [library, setLibrary] = useState<QaEvidenceItemView[]>([]);
  const [sectionKey, setSectionKey] = useState("");
  const [section, setSection] = useState<QaSarBookNarrativeSectionView | null>(null);
  const [sectionRefs, setSectionRefs] = useState<QaSarBookSectionEvidenceReferenceView[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<QaSarBookAppendixGroup>("other");
  const [terminology, setTerminology] = useState<QaSarBookTerminology | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leadershipOrReviewer =
    me?.roles.some((role) => ["admin", "program_coordinator", "qa_reviewer"].includes(role)) ?? false;
  const canManage = me?.permissions.includes("qa:manage") ?? false;

  const editableStaticSections = useMemo(() => {
    if (!book) return [];
    return book.parts.flatMap((part) =>
      part.sections.filter((item) => item.source !== "generated" && item.source !== "requirementSar"),
    );
  }, [book]);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const selectedCycleId = leadershipOrReviewer
        ? (await api.get<QaDashboardView>(`/api/qa/dashboard?${params}`)).selectedCycle?.id ?? null
        : (await api.get<QaContributorWorkspaceView>(`/api/qa/workspace/my-work?${params}`)).selectedCycle?.id ?? null;
      setCycleId(selectedCycleId);
      if (!selectedCycleId) {
        setBook(null);
        setRegister(null);
        return;
      }
      const [bookView, registerView, evidenceRows] = await Promise.all([
        api.get<QaSarBookView>(`/api/qa/cycles/${selectedCycleId}/sar-book?${params}`),
        api.get<QaSarBookEvidenceRegisterView>(
          `/api/qa/cycles/${selectedCycleId}/sar-book/evidence-register?${new URLSearchParams({ programmeId: PROGRAMME_ID, mode: "working" })}`,
        ),
        api.get<QaEvidenceItemView[]>(`/api/qa/evidence-library?${params}`),
      ]);
      setBook(bookView);
      setRegister(registerView);
      setTerminology(registerView.terminology);
      setLibrary(evidenceRows);
      if (!sectionKey) {
        const first = bookView.parts.flatMap((part) => part.sections).find((item) => item.source !== "generated" && item.source !== "requirementSar");
        if (first) setSectionKey(first.key);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load SAR book evidence");
    } finally {
      setLoading(false);
    }
  }, [leadershipOrReviewer, me, sectionKey]);

  useEffect(() => {
    if (!meLoading && me) void load();
  }, [load, me, meLoading]);

  const loadSection = useCallback(async () => {
    if (!cycleId || !sectionKey) {
      setSection(null);
      setSectionRefs([]);
      return;
    }
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const [sectionView, references] = await Promise.all([
        api.get<QaSarBookNarrativeSectionView>(
          `/api/qa/cycles/${cycleId}/sar-book/sections/${encodeURIComponent(sectionKey)}?${params}`,
        ),
        api.get<QaSarBookSectionEvidenceReferenceView[]>(
          `/api/qa/cycles/${cycleId}/sar-book/sections/${encodeURIComponent(sectionKey)}/evidence-references?${params}`,
        ),
      ]);
      setSection(sectionView);
      setSectionRefs(references);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load section evidence");
    }
  }, [cycleId, sectionKey]);

  useEffect(() => {
    void loadSection();
  }, [loadSection]);

  async function addReference() {
    if (!cycleId || !section?.revisionId || !selectedEvidenceId || !section.editable) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(
        `/api/qa/cycles/${cycleId}/sar-book/sections/${encodeURIComponent(sectionKey)}/evidence-references`,
        {
          programmeId: PROGRAMME_ID,
          evidenceId: selectedEvidenceId,
          revisionId: section.revisionId,
          appendixGroup: selectedGroup,
        },
      );
      setSelectedEvidenceId("");
      await Promise.all([loadSection(), load()]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not link evidence to this SAR section");
    } finally {
      setSaving(false);
    }
  }

  async function removeReference(referenceId: string) {
    if (!cycleId || !section?.editable) return;
    setSaving(true);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      await api.delete(`/api/qa/cycles/${cycleId}/sar-book/evidence-references/${referenceId}?${params}`);
      await Promise.all([loadSection(), load()]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not remove evidence reference");
    } finally {
      setSaving(false);
    }
  }

  async function saveTerminology() {
    if (!terminology || !canManage) return;
    setSaving(true);
    try {
      const saved = await api.put<QaSarBookTerminology>("/api/qa/sar-book/terminology", {
        programmeId: PROGRAMME_ID,
        terminology,
      });
      setTerminology(saved);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save SAR terminology");
    } finally {
      setSaving(false);
    }
  }

  async function changeGroup(evidenceId: string, appendixGroup: QaSarBookAppendixGroup) {
    if (!cycleId || !canManage) return;
    try {
      await api.put(`/api/qa/cycles/${cycleId}/sar-book/evidence/${evidenceId}/presentation`, {
        programmeId: PROGRAMME_ID,
        appendixGroup,
      });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update appendix grouping");
    }
  }

  if (meLoading || loading) {
    return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Loading SAR evidence…</div>;
  }
  if (!cycleId || !book || !register || !terminology) {
    return <div className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">No accessible assessment cycle is available.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header className="rounded-xl border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AUN-QA SAR · {book.cycleTitle}</div>
        <h1 className="mt-1 text-xl font-semibold">Evidence</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(SAR_BOOK_MODE_HREFS).map(([mode, href]) => (
            <Link key={mode} href={href} className={`rounded-md border px-3 py-2 text-sm capitalize ${mode === "evidence" ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              {mode}
            </Link>
          ))}
        </div>
      </header>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{terminology.evidenceRegisterTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Canonical evidence is listed once and keeps every SAR usage and provenance boundary.</p>
            </div>
            <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">{register.items.length} items</span>
          </div>
          {register.issues.length ? (
            <div className="mt-4 rounded-lg border border-destructive/30 p-3">
              <div className="text-sm font-medium text-destructive">{register.issues.length} evidence integrity issue(s)</div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {register.issues.map((issue, index) => <li key={`${issue.type}-${issue.evidenceId}-${issue.sectionKey}-${index}`}>{issue.message}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {register.items.map((item) => (
              <article key={item.evidenceId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-muted-foreground">{item.citationText}</div>
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.status} · {item.reportingPeriod || "No reporting period"} · {item.sourceRef || item.sourceUrl || "No source reference"}</div>
                  </div>
                  {canManage ? (
                    <select
                      aria-label={`Appendix group for ${item.title}`}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                      value={item.appendixGroup}
                      onChange={(event) => void changeGroup(item.evidenceId, event.target.value as QaSarBookAppendixGroup)}
                    >
                      {APPENDIX_GROUPS.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
                    </select>
                  ) : <span className="rounded-full border px-2 py-1 text-xs">{item.appendixGroup}</span>}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Used in {item.usages.map((usage) => usage.requirementCode ? `${terminology.requirementLabel} ${usage.requirementCode}` : usage.sectionTitle).join(", ")}
                </div>
              </article>
            ))}
            {!register.items.length ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No SAR evidence references yet.</div> : null}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold">Link evidence to shared section</h2>
            <p className="mt-1 text-xs text-muted-foreground">References attach to the exact current section revision; canonical evidence is never edited here.</p>
            <label className="mt-3 block text-xs font-medium">SAR section</label>
            <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={sectionKey} onChange={(event) => setSectionKey(event.target.value)}>
              {editableStaticSections.map((item: QaSarBookSection) => <option key={item.key} value={item.key}>{item.title}</option>)}
            </select>
            {!section?.revisionId ? (
              <div className="mt-3 rounded-md border border-dashed p-3 text-xs text-muted-foreground">Save this SAR section once before linking evidence so the reference has an exact revision.</div>
            ) : (
              <>
                <div className="mt-3 text-xs text-muted-foreground">Current revision: {section.revisionNumber} · {section.editable ? "editable" : "read-only"}</div>
                <label className="mt-3 block text-xs font-medium">Evidence</label>
                <select disabled={!section.editable} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50" value={selectedEvidenceId} onChange={(event) => setSelectedEvidenceId(event.target.value)}>
                  <option value="">Select evidence…</option>
                  {library.filter((item) => !sectionRefs.some((ref) => ref.evidenceId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
                <label className="mt-3 block text-xs font-medium">Appendix group</label>
                <select disabled={!section.editable} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50" value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value as QaSarBookAppendixGroup)}>
                  {APPENDIX_GROUPS.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
                </select>
                <button disabled={!section.editable || !selectedEvidenceId || saving} onClick={() => void addReference()} className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Add evidence reference</button>
              </>
            )}
            <div className="mt-4 space-y-2 border-t pt-3">
              {sectionRefs.map((ref) => (
                <div key={ref.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                  <span>{ref.evidenceTitle}</span>
                  {section?.editable ? <button disabled={saving} className="text-destructive" onClick={() => void removeReference(ref.id)}>Remove</button> : null}
                </div>
              ))}
            </div>
          </section>

          {canManage ? (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="font-semibold">SAR terminology</h2>
              <p className="mt-1 text-xs text-muted-foreground">Presentation labels only. Evidence IDs, mappings, and historical releases are not rewritten.</p>
              {(
                [
                  ["evidenceCitationLabel", "Evidence citation label"],
                  ["evidenceRegisterTitle", "Evidence register title"],
                  ["appendixLabel", "Appendix label"],
                  ["requirementLabel", "Requirement label"],
                  ["criterionLabel", "Criterion label"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="mt-3 block text-xs font-medium">
                  {label}
                  <input className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={terminology[field]} onChange={(event) => setTerminology({ ...terminology, [field]: event.target.value })} />
                </label>
              ))}
              <button disabled={saving} onClick={() => void saveTerminology()} className="mt-4 w-full rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">Save terminology</button>
            </section>
          ) : null}
        </aside>
      </section>
    </div>
  );
}