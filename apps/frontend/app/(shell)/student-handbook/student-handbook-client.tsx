"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Database,
  Eye,
  FileText,
  GripVertical,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Send,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME,
  type Lecturer,
  type SaveStudentHandbookSectionInput,
  type StudentHandbookDocumentTheme,
  type StudentHandbookSourceKind,
  type StudentHandbookView,
} from "@dse-pms/shared-types";
import { DocumentRenderer, RichTextEditor } from "@/components/document-editor";
import {
  EMPTY_DSE_DOCUMENT,
  parseStoredDocumentContent,
  serializeDocumentContent,
  type DseDocumentContent,
} from "@/lib/document-content";
import { useMe } from "@/lib/auth";
import { lecturersApi } from "@/lib/lecturers";
import { studentHandbookApi } from "@/lib/student-handbook";
import { studentHandbookSourceLabel } from "@/lib/student-handbook-source-catalog";
import { StudentHandbookDocumentPreview } from "./student-handbook-document-preview";
import { SourcePreviewModal } from "./student-handbook-source-preview";
import { StudentHandbookSourceBrowser } from "./student-handbook-source-browser";
import { StudentHandbookThemePanel } from "./student-handbook-theme-panel";

type EditableBlock =
  | { clientKey: string; type: "NARRATIVE"; document: DseDocumentContent }
  | { clientKey: string; type: "SOURCE_DATA"; sourceKind: StudentHandbookSourceKind; label?: string };

type HandbookTab = "content" | "preview";

function statusClasses(status: StudentHandbookView["status"]): string {
  if (status === "PUBLISHED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "APPROVED") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "SUBMITTED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "CHANGES_REQUESTED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function toEditableBlocks(handbook: StudentHandbookView, sectionKey: string): EditableBlock[] {
  const section = handbook.sections.find((item) => item.key === sectionKey);
  if (!section) return [];
  return section.blocks.map((block) =>
    block.type === "NARRATIVE"
      ? { clientKey: block.id, type: "NARRATIVE" as const, document: parseStoredDocumentContent(block.content) }
      : {
          clientKey: block.id,
          type: "SOURCE_DATA" as const,
          sourceKind: block.sourceKind ?? "CURRICULUM_SUMMARY",
          label: block.label ?? undefined,
        },
  );
}

export function StudentHandbookClient() {
  const { me, loading: meLoading } = useMe();
  const [handbooks, setHandbooks] = useState<StudentHandbookView[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lecturers, setLecturers] = useState<Lecturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string>("welcome");
  const [draftBlocks, setDraftBlocks] = useState<EditableBlock[]>([]);
  const [sourcePreview, setSourcePreview] = useState<import("@dse-pms/shared-types").StudentHandbookSourcePreview | null>(null);
  const [sourceBrowserOpen, setSourceBrowserOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [createVersion, setCreateVersion] = useState("2026.1");
  const [createLecturerId, setCreateLecturerId] = useState("");
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [tab, setTab] = useState<HandbookTab>("content");
  const [theme, setTheme] = useState<StudentHandbookDocumentTheme>(DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME);
  const [themeDraft, setThemeDraft] = useState<StudentHandbookDocumentTheme>(DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME);

  const isGovernance = Boolean(me?.roles.some((role) => role === "admin" || role === "program_coordinator"));
  const active = useMemo(
    () => handbooks.find((item) => item.id === activeId) ?? handbooks[0] ?? null,
    [handbooks, activeId],
  );
  const isOwner = Boolean(active && me?.id === active.assignedLecturer.id);
  const editable = Boolean(isOwner && active && (active.status === "DRAFT" || active.status === "CHANGES_REQUESTED"));
  const themeEditable = Boolean(isGovernance && active && (active.status === "DRAFT" || active.status === "CHANGES_REQUESTED"));
  const selectedSection = active?.sections.find((item) => item.key === selectedSectionKey) ?? null;
  const existingSourceKinds = useMemo(
    () => draftBlocks.flatMap((block) => (block.type === "SOURCE_DATA" ? [block.sourceKind] : [])),
    [draftBlocks],
  );

  function applyUpdatedHandbook(updated: StudentHandbookView) {
    setHandbooks((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
  }

  async function reload(preferredId?: string) {
    setLoading(true);
    setError(null);
    try {
      const rows = await studentHandbookApi.list("dse");
      setHandbooks(rows);
      setActiveId(preferredId ?? activeId ?? rows[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Student Handbook");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (meLoading || !me) return;
    void reload();
    if (me.roles.some((role) => role === "admin" || role === "program_coordinator")) {
      lecturersApi
        .list()
        .then((rows) => {
          setLecturers(rows);
          setCreateLecturerId((current) => current || rows[0]?.id || "");
        })
        .catch(() => setLecturers([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoading, me?.id]);

  useEffect(() => {
    if (!active) {
      setDraftBlocks([]);
      return;
    }
    const exists = active.sections.some((item) => item.key === selectedSectionKey);
    const key = exists ? selectedSectionKey : active.sections[0]?.key ?? "welcome";
    if (key !== selectedSectionKey) setSelectedSectionKey(key);
    setDraftBlocks(toEditableBlocks(active, key));
  }, [active?.id, active?.updatedAt, selectedSectionKey]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    studentHandbookApi
      .theme(active.id)
      .then((loadedTheme) => {
        if (cancelled) return;
        setTheme(loadedTheme);
        setThemeDraft(loadedTheme);
      })
      .catch(() => {
        if (cancelled) return;
        setTheme(DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME);
        setThemeDraft(DEFAULT_STUDENT_HANDBOOK_DOCUMENT_THEME);
      });
    return () => {
      cancelled = true;
    };
  }, [active?.id, active?.updatedAt]);

  async function createHandbook() {
    if (!createLecturerId || !createVersion.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await studentHandbookApi.create({ programmeId: "dse", assignedLecturerId: createLecturerId, version: createVersion.trim(), title: "Student Handbook" });
      await reload(created.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create handbook");
    } finally {
      setSaving(false);
    }
  }

  async function saveSection() {
    if (!active || !selectedSection) return;
    setSaving(true);
    setError(null);
    try {
      const blocks: SaveStudentHandbookSectionInput["blocks"] = draftBlocks.map((block) =>
        block.type === "NARRATIVE"
          ? { type: "NARRATIVE", content: serializeDocumentContent(block.document) }
          : { type: "SOURCE_DATA", sourceKind: block.sourceKind, label: block.label },
      );
      applyUpdatedHandbook(await studentHandbookApi.saveSection(active.id, selectedSection.key, { blocks }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save section");
    } finally {
      setSaving(false);
    }
  }

  async function saveTheme() {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await studentHandbookApi.updateTheme(active.id, themeDraft);
      setTheme(saved);
      setThemeDraft(saved);
      await reload(active.id);
    } catch (themeError) {
      setError(themeError instanceof Error ? themeError.message : "Could not save document style");
    } finally {
      setSaving(false);
    }
  }

  async function addSection() {
    if (!active) return;
    const title = window.prompt("New section title");
    if (!title?.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await studentHandbookApi.addSection(active.id, { title: title.trim() });
      applyUpdatedHandbook(updated);
      const added = updated.sections.find((section) => !active.sections.some((existing) => existing.id === section.id));
      if (added) setSelectedSectionKey(added.key);
    } catch (sectionError) {
      setError(sectionError instanceof Error ? sectionError.message : "Could not add section");
    } finally {
      setSaving(false);
    }
  }

  async function renameCustomSection(sectionId: string, currentTitle: string) {
    if (!active) return;
    const title = window.prompt("Section title", currentTitle);
    if (!title?.trim() || title.trim() === currentTitle) return;
    setSaving(true);
    setError(null);
    try {
      applyUpdatedHandbook(await studentHandbookApi.renameSection(active.id, sectionId, { title: title.trim() }));
    } catch (sectionError) {
      setError(sectionError instanceof Error ? sectionError.message : "Could not rename section");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCustomSection(sectionId: string, title: string) {
    if (!active || !window.confirm(`Delete “${title}”? This removes its handbook content.`)) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await studentHandbookApi.deleteSection(active.id, sectionId);
      applyUpdatedHandbook(updated);
      if (!updated.sections.some((section) => section.key === selectedSectionKey)) setSelectedSectionKey(updated.sections[0]?.key ?? "welcome");
    } catch (sectionError) {
      setError(sectionError instanceof Error ? sectionError.message : "Could not delete section");
    } finally {
      setSaving(false);
    }
  }

  async function saveSectionOrder(sectionIds: string[]) {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      applyUpdatedHandbook(await studentHandbookApi.reorderSections(active.id, { sectionIds }));
    } catch (sectionError) {
      setError(sectionError instanceof Error ? sectionError.message : "Could not reorder sections");
    } finally {
      setSaving(false);
    }
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    if (!active) return;
    const ids = active.sections.map((section) => section.id);
    const index = ids.indexOf(sectionId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    void saveSectionOrder(ids);
  }

  function dropSection(targetSectionId: string) {
    if (!active || !draggedSectionId || draggedSectionId === targetSectionId) return;
    const ids = active.sections.map((section) => section.id);
    const from = ids.indexOf(draggedSectionId);
    const to = ids.indexOf(targetSectionId);
    if (from < 0 || to < 0) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    setDraggedSectionId(null);
    void saveSectionOrder(ids);
  }

  async function viewSource(kind: StudentHandbookSourceKind) {
    if (!active) return;
    setError(null);
    try {
      setSourcePreview(await studentHandbookApi.source(active.id, kind));
    } catch (sourceError) {
      setError(sourceError instanceof Error ? sourceError.message : "Could not load source data");
    }
  }

  async function runWorkflow(action: "submit" | "request" | "approve" | "publish") {
    if (!active) return;
    setSaving(true);
    setError(null);
    try {
      const updated = action === "submit"
        ? await studentHandbookApi.submit(active.id)
        : action === "request"
          ? await studentHandbookApi.requestChanges(active.id, { note: reviewNote })
          : action === "approve"
            ? await studentHandbookApi.approve(active.id, { note: reviewNote })
            : await studentHandbookApi.publish(active.id, { note: reviewNote });
      setReviewNote("");
      applyUpdatedHandbook(updated);
    } catch (workflowError) {
      setError(workflowError instanceof Error ? workflowError.message : "Could not update workflow");
    } finally {
      setSaving(false);
    }
  }

  async function reassign(lecturerId: string) {
    if (!active || !lecturerId) return;
    setSaving(true);
    setError(null);
    try {
      applyUpdatedHandbook(await studentHandbookApi.assign(active.id, { assignedLecturerId: lecturerId }));
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not assign lecturer");
    } finally {
      setSaving(false);
    }
  }

  function insertSources(kinds: StudentHandbookSourceKind[]) {
    const existing = new Set(existingSourceKinds);
    const additions: EditableBlock[] = kinds
      .filter((kind) => !existing.has(kind))
      .map((kind) => ({ clientKey: crypto.randomUUID(), type: "SOURCE_DATA" as const, sourceKind: kind, label: studentHandbookSourceLabel(kind) }));
    if (additions.length) setDraftBlocks((rows) => [...rows, ...additions]);
    setSourceBrowserOpen(false);
  }

  if (meLoading || loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Student Handbook…</div>;
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        {error ? <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        {isGovernance ? (
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-start gap-3"><BookOpen className="mt-1 h-5 w-5 text-primary" /><div><h2 className="text-lg font-semibold">Create Student Handbook</h2><p className="mt-1 text-sm text-muted-foreground">Assign one lecturer to complete the whole handbook. PMS data blocks remain read-only.</p></div></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Version<input value={createVersion} onChange={(event) => setCreateVersion(event.target.value)} className="mt-2 w-full rounded-md border bg-background px-3 py-2 font-normal" /></label>
              <label className="text-sm font-medium">Assigned lecturer<select value={createLecturerId} onChange={(event) => setCreateLecturerId(event.target.value)} className="mt-2 w-full rounded-md border bg-background px-3 py-2 font-normal">{lecturers.map((lecturer) => <option key={lecturer.id} value={lecturer.id}>{lecturer.name} · {lecturer.email}</option>)}</select></label>
            </div>
            <button type="button" disabled={saving || !createLecturerId} onClick={() => void createHandbook()} className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Creating…" : "Create & Assign"}</button>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center"><UserRound className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">No Student Handbook assigned to you</h2><p className="mt-2 text-sm text-muted-foreground">A Programme Coordinator or Admin must assign the handbook to one lecturer.</p></div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {sourcePreview ? <SourcePreviewModal preview={sourcePreview} onClose={() => setSourcePreview(null)} /> : null}
      {sourceBrowserOpen ? <StudentHandbookSourceBrowser sectionKey={selectedSectionKey} existingKinds={existingSourceKinds} onClose={() => setSourceBrowserOpen(false)} onInsert={insertSources} /> : null}

      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-semibold">{active.title}</h2><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(active.status)}`}>{active.status.replaceAll("_", " ")}</span><span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">v{active.version}</span></div>
          <p className="mt-1 text-sm text-muted-foreground">Assigned to {active.assignedLecturer.name} · one lecturer owns the full handbook</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {handbooks.length > 1 ? <select value={active.id} onChange={(event) => setActiveId(event.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm">{handbooks.map((handbook) => <option key={handbook.id} value={handbook.id}>v{handbook.version} · {handbook.status.replaceAll("_", " ")}</option>)}</select> : null}
          {editable ? <button type="button" disabled={saving} onClick={() => void runWorkflow("submit")} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /> Submit for Review</button> : null}
        </div>
      </div>

      {error ? <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}

      {isGovernance ? (
        <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-medium">Assigned lecturer<select value={active.assignedLecturer.id} disabled={!['DRAFT', 'CHANGES_REQUESTED'].includes(active.status) || saving} onChange={(event) => void reassign(event.target.value)} className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal disabled:opacity-60">{lecturers.map((lecturer) => <option key={lecturer.id} value={lecturer.id}>{lecturer.name} · {lecturer.email}</option>)}</select></label>
          <label className="text-sm font-medium">Review note<input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Optional reviewer note" className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal" /></label>
          <div className="flex items-end gap-2">{active.status === "SUBMITTED" ? <><button type="button" disabled={saving} onClick={() => void runWorkflow("request")} className="rounded-md border px-3 py-2 text-sm font-medium">Request Changes</button><button type="button" disabled={saving} onClick={() => void runWorkflow("approve")} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Approve</button></> : null}{active.status === "APPROVED" ? <button type="button" disabled={saving} onClick={() => void runWorkflow("publish")} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white">Publish</button> : null}</div>
        </div>
      ) : null}

      <div className="mb-4 flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
        <button type="button" onClick={() => setTab("content")} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "content" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Content</button>
        <button type="button" onClick={() => setTab("preview")} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>Preview</button>
        {tab === "preview" && editable ? <span className="ml-auto pr-3 text-xs text-muted-foreground">Preview shows the last saved handbook content.</span> : null}
      </div>

      {tab === "preview" ? (
        <div className={`grid gap-5 ${isGovernance ? "xl:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
          <div className="min-w-0 overflow-x-auto rounded-xl bg-slate-100 p-4 md:p-8">
            <StudentHandbookDocumentPreview handbook={active} theme={themeDraft} />
          </div>
          {isGovernance ? <StudentHandbookThemePanel value={themeDraft} onChange={setThemeDraft} onSave={() => void saveTheme()} saving={saving} disabled={!themeEditable} /> : null}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between px-2 pb-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sections</p>{editable ? <button type="button" disabled={saving} onClick={() => void addSection()} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium"><Plus className="h-3.5 w-3.5" /> Add Section</button> : null}</div>
            <nav className="space-y-1">
              {active.sections.map((section, index) => (
                <div key={section.id} draggable={editable} onDragStart={() => setDraggedSectionId(section.id)} onDragEnd={() => setDraggedSectionId(null)} onDragOver={(event) => editable && event.preventDefault()} onDrop={() => dropSection(section.id)} className={`group flex items-center rounded-lg ${section.key === selectedSectionKey ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                  {editable ? <GripVertical className="ml-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" /> : null}
                  <button type="button" onClick={() => setSelectedSectionKey(section.key)} className="min-w-0 flex-1 px-2 py-2.5 text-left text-sm"><span className={section.key === selectedSectionKey ? "font-medium" : ""}>{index + 1}. {section.title}</span><span className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">{section.isCore ? <><Lock className="h-2.5 w-2.5" /> Core</> : "Custom"}</span></button>
                  {editable ? <div className="mr-1 flex shrink-0 items-center"><button type="button" disabled={index === 0 || saving} onClick={() => moveSection(section.id, -1)} className="rounded p-1 text-muted-foreground hover:bg-background disabled:opacity-30" aria-label={`Move ${section.title} up`}><ChevronUp className="h-3.5 w-3.5" /></button><button type="button" disabled={index === active.sections.length - 1 || saving} onClick={() => moveSection(section.id, 1)} className="rounded p-1 text-muted-foreground hover:bg-background disabled:opacity-30" aria-label={`Move ${section.title} down`}><ChevronDown className="h-3.5 w-3.5" /></button>{!section.isCore ? <><button type="button" disabled={saving} onClick={() => void renameCustomSection(section.id, section.title)} className="rounded p-1 text-muted-foreground hover:bg-background" aria-label={`Rename ${section.title}`}><Pencil className="h-3.5 w-3.5" /></button><button type="button" disabled={saving} onClick={() => void deleteCustomSection(section.id, section.title)} className="rounded p-1 text-destructive hover:bg-background" aria-label={`Delete ${section.title}`}><Trash2 className="h-3.5 w-3.5" /></button></> : null}</div> : <ChevronRight className="mr-2 h-4 w-4" />}
                </div>
              ))}
            </nav>
          </aside>

          <section className="min-w-0 rounded-xl border bg-card p-4 shadow-sm md:p-5">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{selectedSection?.title}</h3><p className="mt-1 text-sm text-muted-foreground">Narrative uses the shared DSE editor. PMS blocks remain read-only references.</p></div>{editable ? <button type="button" disabled={saving} onClick={() => void saveSection()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Save Section"}</button> : null}</div>
            <div className="mt-5 space-y-3">
              {draftBlocks.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No content blocks yet.</div> : null}
              {draftBlocks.map((block, index) => (
                <div key={block.clientKey} className={`rounded-xl border p-4 ${block.type === "SOURCE_DATA" ? "border-emerald-200 bg-emerald-50/40" : "border-blue-200 bg-blue-50/20"}`}>
                  <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2">{block.type === "SOURCE_DATA" ? <Database className="h-4 w-4 text-emerald-700" /> : <FileText className="h-4 w-4 text-blue-700" />}<span className={`rounded-full px-2 py-1 text-xs font-medium ${block.type === "SOURCE_DATA" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>{block.type === "SOURCE_DATA" ? studentHandbookSourceLabel(block.sourceKind) : "Narrative"}</span><span className="text-xs text-muted-foreground">Block {index + 1}</span></div>{editable ? <button type="button" onClick={() => setDraftBlocks((rows) => rows.filter((row) => row.clientKey !== block.clientKey))} className="text-xs font-medium text-destructive hover:underline">Remove</button> : null}</div>
                  {block.type === "NARRATIVE" ? editable ? <RichTextEditor value={block.document} ariaLabel={`${selectedSection?.title ?? "Handbook"} narrative block ${index + 1}`} onChange={(document) => setDraftBlocks((rows) => rows.map((row) => row.clientKey === block.clientKey && row.type === "NARRATIVE" ? { ...row, document } : row))} /> : <DocumentRenderer value={block.document} /> : <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{block.label ?? studentHandbookSourceLabel(block.sourceKind)}</p><p className="mt-1 text-xs text-muted-foreground">Source of truth: PMS · cannot be edited from the handbook</p></div><button type="button" onClick={() => void viewSource(block.sourceKind)} className="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium"><Eye className="h-4 w-4" /> View Source</button></div>}
                </div>
              ))}
            </div>
            {editable ? <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3"><button type="button" onClick={() => setDraftBlocks((rows) => [...rows, { clientKey: crypto.randomUUID(), type: "NARRATIVE", document: EMPTY_DSE_DOCUMENT }])} className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium"><Plus className="h-4 w-4" /> Add Narrative</button><button type="button" onClick={() => setSourceBrowserOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"><Database className="h-4 w-4" /> Insert PMS Data</button></div> : null}
          </section>
        </div>
      )}
    </div>
  );
}
