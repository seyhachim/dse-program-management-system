"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  FileText,
  Loader2,
  Plus,
  Send,
  UserRound,
  X,
} from "lucide-react";
import type {
  Lecturer,
  SaveStudentHandbookSectionInput,
  StudentHandbookSourceKind,
  StudentHandbookSourcePreview,
  StudentHandbookView,
} from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { lecturersApi } from "@/lib/lecturers";
import { studentHandbookApi } from "@/lib/student-handbook";
import { studentHandbookSourceLabel } from "@/lib/student-handbook-source-catalog";
import { getStudentHandbookUnavailableSourceState } from "@/lib/student-handbook-source-state";
import { StudentHandbookSourceBrowser } from "./student-handbook-source-browser";

type EditableBlock = SaveStudentHandbookSectionInput["blocks"][number] & {
  clientKey: string;
};

function statusClasses(status: StudentHandbookView["status"]): string {
  if (status === "PUBLISHED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "APPROVED") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "SUBMITTED") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "CHANGES_REQUESTED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function toEditableBlocks(
  handbook: StudentHandbookView,
  sectionKey: string,
): EditableBlock[] {
  const section = handbook.sections.find((item) => item.key === sectionKey);
  if (!section) return [];
  return section.blocks.map((block) =>
    block.type === "NARRATIVE"
      ? {
          clientKey: block.id,
          type: "NARRATIVE" as const,
          content: block.content ?? "",
        }
      : {
          clientKey: block.id,
          type: "SOURCE_DATA" as const,
          sourceKind: block.sourceKind ?? "CURRICULUM_SUMMARY",
          label: block.label ?? undefined,
        },
  );
}

function SourcePreviewModal({
  preview,
  onClose,
}: {
  preview: StudentHandbookSourcePreview;
  onClose: () => void;
}) {
  const unavailable = getStudentHandbookUnavailableSourceState(preview);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-600" />
              <h2 className="font-semibold text-foreground">
                {unavailable?.title ?? preview.label}
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Authoritative PMS data · Read only{preview.snapshot ? " · Published snapshot" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            aria-label="Close source preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[68vh] overflow-auto p-5">
          {unavailable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <p className="font-medium text-foreground">{unavailable.message}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {unavailable.explanation}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                    <Database className="h-3.5 w-3.5" /> Read-only PMS source
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-xs leading-6 text-foreground">
              {JSON.stringify(preview.data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
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
  const [sourcePreview, setSourcePreview] = useState<StudentHandbookSourcePreview | null>(null);
  const [sourceBrowserOpen, setSourceBrowserOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [createVersion, setCreateVersion] = useState("2026.1");
  const [createLecturerId, setCreateLecturerId] = useState("");

  const isGovernance = Boolean(
    me?.roles.some((role) => role === "admin" || role === "program_coordinator"),
  );

  const active = useMemo(
    () => handbooks.find((item) => item.id === activeId) ?? handbooks[0] ?? null,
    [handbooks, activeId],
  );

  const isOwner = Boolean(active && me?.id === active.assignedLecturer.id);
  const editable = Boolean(
    isOwner && active && (active.status === "DRAFT" || active.status === "CHANGES_REQUESTED"),
  );
  const selectedSection = active?.sections.find((item) => item.key === selectedSectionKey) ?? null;
  const existingSourceKinds = useMemo(
    () =>
      draftBlocks.flatMap((block) =>
        block.type === "SOURCE_DATA" ? [block.sourceKind] : [],
      ),
    [draftBlocks],
  );

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

  async function createHandbook() {
    if (!createLecturerId || !createVersion.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await studentHandbookApi.create({
        programmeId: "dse",
        assignedLecturerId: createLecturerId,
        version: createVersion.trim(),
        title: "Student Handbook",
      });
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
          ? { type: "NARRATIVE", content: block.content }
          : { type: "SOURCE_DATA", sourceKind: block.sourceKind, label: block.label },
      );
      const updated = await studentHandbookApi.saveSection(active.id, selectedSection.key, { blocks });
      setHandbooks((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save section");
    } finally {
      setSaving(false);
    }
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
      const updated =
        action === "submit"
          ? await studentHandbookApi.submit(active.id)
          : action === "request"
            ? await studentHandbookApi.requestChanges(active.id, { note: reviewNote })
            : action === "approve"
              ? await studentHandbookApi.approve(active.id, { note: reviewNote })
              : await studentHandbookApi.publish(active.id, { note: reviewNote });
      setReviewNote("");
      setHandbooks((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
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
      const updated = await studentHandbookApi.assign(active.id, { assignedLecturerId: lecturerId });
      setHandbooks((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
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
      .map((kind) => ({
        clientKey: crypto.randomUUID(),
        type: "SOURCE_DATA" as const,
        sourceKind: kind,
        label: studentHandbookSourceLabel(kind),
      }));
    if (additions.length) setDraftBlocks((rows) => [...rows, ...additions]);
    setSourceBrowserOpen(false);
  }

  if (meLoading || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Student Handbook…
      </div>
    );
  }

  if (!active) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        {error ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {isGovernance ? (
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <BookOpen className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Create Student Handbook</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Assign one lecturer to complete the whole handbook. PMS data blocks remain read-only.
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Version
                <input
                  value={createVersion}
                  onChange={(event) => setCreateVersion(event.target.value)}
                  className="mt-2 w-full rounded-md border bg-background px-3 py-2 font-normal"
                />
              </label>
              <label className="text-sm font-medium">
                Assigned lecturer
                <select
                  value={createLecturerId}
                  onChange={(event) => setCreateLecturerId(event.target.value)}
                  className="mt-2 w-full rounded-md border bg-background px-3 py-2 font-normal"
                >
                  {lecturers.map((lecturer) => (
                    <option key={lecturer.id} value={lecturer.id}>
                      {lecturer.name} · {lecturer.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={saving || !createLecturerId}
              onClick={() => void createHandbook()}
              className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create & Assign"}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-8 text-center">
            <UserRound className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-4 font-semibold">No Student Handbook assigned to you</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A Programme Coordinator or Admin must assign the handbook to one lecturer.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {sourcePreview ? (
        <SourcePreviewModal preview={sourcePreview} onClose={() => setSourcePreview(null)} />
      ) : null}
      {sourceBrowserOpen ? (
        <StudentHandbookSourceBrowser
          sectionKey={selectedSectionKey}
          existingKinds={existingSourceKinds}
          onClose={() => setSourceBrowserOpen(false)}
          onInsert={insertSources}
        />
      ) : null}

      <div className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{active.title}</h2>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(active.status)}`}>
              {active.status.replaceAll("_", " ")}
            </span>
            <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
              v{active.version}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Assigned to {active.assignedLecturer.name} · one lecturer owns the full handbook
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {handbooks.length > 1 ? (
            <select
              value={active.id}
              onChange={(event) => setActiveId(event.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            >
              {handbooks.map((handbook) => (
                <option key={handbook.id} value={handbook.id}>
                  v{handbook.version} · {handbook.status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          ) : null}
          {editable ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void runWorkflow("submit")}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Submit for Review
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {isGovernance ? (
        <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 lg:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-medium">
            Assigned lecturer
            <select
              value={active.assignedLecturer.id}
              disabled={!['DRAFT', 'CHANGES_REQUESTED'].includes(active.status) || saving}
              onChange={(event) => void reassign(event.target.value)}
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal disabled:opacity-60"
            >
              {lecturers.map((lecturer) => (
                <option key={lecturer.id} value={lecturer.id}>
                  {lecturer.name} · {lecturer.email}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Review note
            <input
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Optional reviewer note"
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 font-normal"
            />
          </label>
          <div className="flex items-end gap-2">
            {active.status === "SUBMITTED" ? (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void runWorkflow("request")}
                  className="rounded-md border px-3 py-2 text-sm font-medium"
                >
                  Request Changes
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void runWorkflow("approve")}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  Approve
                </button>
              </>
            ) : null}
            {active.status === "APPROVED" ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void runWorkflow("publish")}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white"
              >
                Publish
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_360px]">
        <aside className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sections
          </p>
          <nav className="space-y-1">
            {active.sections.map((section, index) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setSelectedSectionKey(section.key)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${
                  section.key === selectedSectionKey
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <span>{index + 1}. {section.title}</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-w-0 rounded-xl border bg-card p-4 shadow-sm md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{selectedSection?.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Narrative is authored here. PMS blocks are inserted as read-only references.
              </p>
            </div>
            {editable ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveSection()}
                className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Section"}
              </button>
            ) : null}
          </div>

          <div className="mt-5 space-y-3">
            {draftBlocks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No content blocks yet.
              </div>
            ) : null}
            {draftBlocks.map((block, index) => (
              <div
                key={block.clientKey}
                className={`rounded-xl border p-4 ${
                  block.type === "SOURCE_DATA"
                    ? "border-emerald-200 bg-emerald-50/40"
                    : "border-blue-200 bg-blue-50/20"
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {block.type === "SOURCE_DATA" ? (
                      <Database className="h-4 w-4 text-emerald-700" />
                    ) : (
                      <FileText className="h-4 w-4 text-blue-700" />
                    )}
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${block.type === "SOURCE_DATA" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                      {block.type === "SOURCE_DATA" ? studentHandbookSourceLabel(block.sourceKind) : "Narrative"}
                    </span>
                    <span className="text-xs text-muted-foreground">Block {index + 1}</span>
                  </div>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => setDraftBlocks((rows) => rows.filter((row) => row.clientKey !== block.clientKey))}
                      className="text-xs font-medium text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                {block.type === "NARRATIVE" ? (
                  editable ? (
                    <textarea
                      rows={6}
                      value={block.content}
                      onChange={(event) =>
                        setDraftBlocks((rows) =>
                          rows.map((row) =>
                            row.clientKey === block.clientKey && row.type === "NARRATIVE"
                              ? { ...row, content: event.target.value }
                              : row,
                          ),
                        )
                      }
                      className="w-full resize-y rounded-lg border bg-background p-3 text-sm leading-6"
                      placeholder="Write the student-facing handbook narrative…"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm leading-6">{block.content}</p>
                  )
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium">{block.label ?? studentHandbookSourceLabel(block.sourceKind)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Source of truth: PMS · cannot be edited from the handbook
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void viewSource(block.sourceKind)}
                      className="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium"
                    >
                      <Eye className="h-4 w-4" /> View Source
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {editable ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
              <button
                type="button"
                onClick={() =>
                  setDraftBlocks((rows) => [
                    ...rows,
                    { clientKey: crypto.randomUUID(), type: "NARRATIVE", content: "" },
                  ])
                }
                className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium"
              >
                <Plus className="h-4 w-4" /> Add Narrative
              </button>
              <button
                type="button"
                onClick={() => setSourceBrowserOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
              >
                <Database className="h-4 w-4" /> Insert PMS Data
              </button>
            </div>
          ) : null}
        </section>

        <aside className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 border-b pb-3">
            <Eye className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">Section Preview</h3>
          </div>
          <div className="py-4">
            <h4 className="text-lg font-semibold">{selectedSection?.title}</h4>
            <div className="mt-4 space-y-4">
              {draftBlocks.map((block) =>
                block.type === "NARRATIVE" ? (
                  <p key={block.clientKey} className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                    {block.content || <span className="italic text-muted-foreground">Empty narrative</span>}
                  </p>
                ) : (
                  <div key={block.clientKey} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-900">
                      <Database className="h-4 w-4" /> {block.label ?? studentHandbookSourceLabel(block.sourceKind)}
                    </div>
                    <p className="mt-1 text-xs text-emerald-800/80">Authoritative PMS data block</p>
                  </div>
                ),
              )}
            </div>
          </div>
          <div className="mt-2 rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Source-of-truth rule
            </div>
            <p className="mt-1">
              Data blocks are read-only here. When the handbook is published, PMS source data is captured as an immutable snapshot for that edition.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
