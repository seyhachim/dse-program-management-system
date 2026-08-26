"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, FileCheck2, History, Save, UserRoundCheck } from "lucide-react";
import type {
  ProgrammeRoleAssignmentView,
  QaContributorWorkspaceView,
  QaDashboardView,
  QaSarBookNarrativeSectionView,
  QaSarBookSection,
  QaSarBookView,
} from "@dse-pms/shared-types";
import { DocumentRenderer, RichTextEditor } from "@/components/document-editor";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/auth";
import {
  parseStoredDocumentContent,
  serializeDocumentContent,
  type DseDocumentContent,
} from "@/lib/document-content";
import { SAR_BOOK_MODE_HREFS, sarBookRequirementHref } from "./sar-book-navigation";

const PROGRAMME_ID = "dse";

type Selection = { section: QaSarBookSection };

export function SarBookClient() {
  const { me, loading: meLoading } = useMe();
  const [book, setBook] = useState<QaSarBookView | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [narrative, setNarrative] = useState<QaSarBookNarrativeSectionView | null>(null);
  const [document, setDocument] = useState<DseDocumentContent | null>(null);
  const [contributors, setContributors] = useState<ProgrammeRoleAssignmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sectionRequestIdRef = useRef(0);

  const leadershipOrReviewer =
    me?.roles.some((role) => ["admin", "program_coordinator", "qa_reviewer"].includes(role)) ?? false;
  const canManage = me?.permissions.includes("qa:manage") ?? false;

  const loadBook = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
      const cycleId = leadershipOrReviewer
        ? (await api.get<QaDashboardView>(`/api/qa/dashboard?${params}`)).selectedCycle?.id
        : (await api.get<QaContributorWorkspaceView>(`/api/qa/workspace/my-work?${params}`)).selectedCycle?.id;

      if (!cycleId) {
        setBook(null);
        setContributors([]);
        return;
      }

      const [loadedBook, programmeRoles] = await Promise.all([
        api.get<QaSarBookView>(`/api/qa/cycles/${cycleId}/sar-book?${params}`),
        canManage
          ? api.get<ProgrammeRoleAssignmentView[]>(`/api/auth/programme-roles?${params}`)
          : Promise.resolve([]),
      ]);
      setBook(loadedBook);
      setContributors(programmeRoles.filter((item) => item.role === "qa_contributor"));
      const first = loadedBook.parts[0]?.sections[0];
      if (first) setSelection({ section: first });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the SAR book");
    } finally {
      setLoading(false);
    }
  }, [canManage, leadershipOrReviewer, me]);

  useEffect(() => {
    if (!meLoading && me) void loadBook();
  }, [loadBook, me, meLoading]);

  const loadSelectedSection = useCallback(async () => {
    const requestId = ++sectionRequestIdRef.current;
    if (!book || !selection || selection.section.source === "generated") {
      setNarrative(null);
      setDocument(null);
      setSectionLoading(false);
      return;
    }

    setSectionLoading(true);
    setError(null);
    const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
    try {
      const loaded = await api.get<QaSarBookNarrativeSectionView>(
        `/api/qa/cycles/${book.cycleId}/sar-book/sections/${encodeURIComponent(selection.section.key)}?${params}`,
      );
      if (requestId !== sectionRequestIdRef.current) return;
      setNarrative(loaded);
      setDocument(parseStoredDocumentContent(loaded.content));
    } catch (caught) {
      if (requestId !== sectionRequestIdRef.current) return;
      setError(caught instanceof ApiError ? caught.message : "Could not load SAR book section");
    } finally {
      if (requestId === sectionRequestIdRef.current) setSectionLoading(false);
    }
  }, [book, selection]);

  useEffect(() => {
    void loadSelectedSection();
  }, [loadSelectedSection]);

  const selectedPartTitle = useMemo(() => {
    if (!book || !selection) return "";
    return book.parts.find((part) =>
      part.sections.some((section) => section.key === selection.section.key),
    )?.title ?? "";
  }, [book, selection]);

  async function save() {
    if (!book || !selection || !narrative?.editable || !document) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.put<QaSarBookNarrativeSectionView>(
        `/api/qa/cycles/${book.cycleId}/sar-book/sections/${encodeURIComponent(selection.section.key)}`,
        {
          programmeId: PROGRAMME_ID,
          content: serializeDocumentContent(document),
          baseRevisionId: narrative.revisionId,
        },
      );
      setNarrative(saved);
      setDocument(parseStoredDocumentContent(saved.content));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save SAR book section");
    } finally {
      setSaving(false);
    }
  }

  async function changeAssignment(assigneeId: string) {
    if (!book || !selection || selection.section.source === "generated" || !canManage) return;
    setAssignmentSaving(true);
    setError(null);
    const sectionKey = encodeURIComponent(selection.section.key);
    const path = `/api/qa/cycles/${book.cycleId}/sar-book/sections/${sectionKey}/assignment`;
    try {
      if (assigneeId) {
        await api.put(path, { programmeId: PROGRAMME_ID, assigneeId });
      } else {
        const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
        await api.delete(`${path}?${params}`);
      }
      await loadSelectedSection();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update the section owner");
    } finally {
      setAssignmentSaving(false);
    }
  }

  if (meLoading || loading) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">Loading complete SAR book…</div>;
  }

  if (!book) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">No accessible AUN-QA assessment cycle was found.</div>;
  }

  const context = selection ? (
    <SectionContext
      section={selection.section}
      narrative={narrative}
      contributors={contributors}
      canManage={canManage}
      assignmentSaving={assignmentSaving}
      onChangeAssignment={changeAssignment}
    />
  ) : null;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <header className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-primary">AUN-QA SAR · {book.cycleTitle}</div>
            <h1 className="text-xl font-semibold">Complete Self-Assessment Report</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              One report book. Requirement sections remain the distributed writing and evidence units inside Part 2.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground">Content</span>
            <Link href={SAR_BOOK_MODE_HREFS.evidence} className="rounded-md border px-3 py-2">Evidence</Link>
            <Link href={SAR_BOOK_MODE_HREFS.review} className="rounded-md border px-3 py-2">Review</Link>
            <Link href={SAR_BOOK_MODE_HREFS.preview} className="rounded-md border px-3 py-2">Preview</Link>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3"><strong>{book.totals.criteria}</strong> criteria</div>
          <div className="rounded-lg bg-slate-50 p-3"><strong>{book.totals.requirements}</strong> requirement sections</div>
          <div className="rounded-lg bg-slate-50 p-3"><strong>{book.lineage.length}</strong> official release{book.lineage.length === 1 ? "" : "s"}</div>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)_300px]">
        <aside className="rounded-xl border bg-white p-3 lg:sticky lg:top-4 lg:self-start">
          <div className="mb-3 flex items-center gap-2 px-2 font-semibold"><BookOpen className="h-4 w-4" /> SAR Book</div>
          <div className="space-y-2">
            {book.parts.map((part) => (
              <details key={part.id} open className="rounded-lg border bg-slate-50/60">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold">
                  <span className="inline-flex items-center gap-2"><ChevronDown className="h-3.5 w-3.5" />{part.title}</span>
                </summary>
                <div className="space-y-1 border-t p-2">
                  {part.sections.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setSelection({ section })}
                      className={`w-full rounded-md px-2 py-2 text-left text-sm ${selection?.section.key === section.key ? "bg-primary text-primary-foreground" : "hover:bg-white"}`}
                    >
                      {section.title}
                    </button>
                  ))}
                  {part.criteria.map((criterion) => (
                    <details key={criterion.id} className="rounded-md bg-white">
                      <summary className="cursor-pointer px-2 py-2 text-sm font-medium">Criterion {criterion.code} · {criterion.title}</summary>
                      <div className="space-y-1 px-2 pb-2">
                        {criterion.sections.map((section) => (
                          <Link
                            key={section.key}
                            href={sarBookRequirementHref(section.requirementCode ?? "")}
                            className="block rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-slate-50 hover:text-foreground"
                          >
                            {section.requirementCode} · {section.title}
                          </Link>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </aside>

        <main className="min-w-0 rounded-xl border bg-white shadow-sm">
          {!selection ? (
            <div className="p-8 text-sm text-muted-foreground">Choose a SAR book section.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selectedPartTitle}</div>
                  <h2 className="text-lg font-semibold">{selection.section.title}</h2>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selection.section.source === "generated"
                      ? "Generated from canonical PMS evidence"
                      : narrative?.revisionNumber
                        ? `Revision ${narrative.revisionNumber}${narrative.updatedByName ? ` · ${narrative.updatedByName}` : ""}`
                        : "Not written yet"}
                  </div>
                </div>
                {narrative?.editable && selection.section.source !== "generated" ? (
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || sectionLoading}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save new revision"}
                  </button>
                ) : null}
              </div>
              <div className="min-h-[620px] p-5 md:p-8">
                {sectionLoading ? (
                  <div className="text-sm text-muted-foreground">Loading section…</div>
                ) : selection.section.source === "generated" ? (
                  <div className="rounded-xl border border-dashed p-6">
                    <div className="flex items-center gap-2 font-semibold"><FileCheck2 className="h-4 w-4" /> Evidence Register</div>
                    <p className="mt-2 text-sm text-muted-foreground">This section is generated from canonical evidence references and is intentionally not manually editable.</p>
                  </div>
                ) : document && narrative ? (
                  narrative.editable ? (
                    <RichTextEditor
                      value={document}
                      onChange={setDocument}
                      ariaLabel={`SAR book section: ${selection.section.title}`}
                    />
                  ) : (
                    <div className="space-y-3">
                      {!canManage && narrative.assignment ? (
                        <div className="rounded-lg border bg-slate-50 p-3 text-sm text-muted-foreground">
                          This section is assigned to {narrative.assignment.assignee.name} and is read-only for you.
                        </div>
                      ) : !canManage ? (
                        <div className="rounded-lg border bg-slate-50 p-3 text-sm text-muted-foreground">
                          This shared section is read-only until programme leadership assigns it to you.
                        </div>
                      ) : null}
                      <div className="rounded-lg border p-4"><DocumentRenderer value={document} /></div>
                    </div>
                  )
                ) : (
                  <div className="text-sm text-muted-foreground">This structured section is prepared here and receives its dedicated fields in the later Part 3/evidence phases.</div>
                )}
              </div>
            </>
          )}
        </main>

        <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start">{context}</aside>
      </div>

      <div className="xl:hidden">{context}</div>
    </div>
  );
}

function SectionContext({
  section,
  narrative,
  contributors,
  canManage,
  assignmentSaving,
  onChangeAssignment,
}: {
  section: QaSarBookSection;
  narrative: QaSarBookNarrativeSectionView | null;
  contributors: ProgrammeRoleAssignmentView[];
  canManage: boolean;
  assignmentSaving: boolean;
  onChangeAssignment: (assigneeId: string) => Promise<void>;
}) {
  const generated = section.source === "generated";
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-sm font-semibold">Section context</div>
      <div className="mt-3 space-y-4 text-sm text-muted-foreground">
        <p>{section.required ? "Required SAR section" : "Optional SAR section"}</p>
        <p>Source: {generated ? "Generated PMS data" : "SAR book content"}</p>

        {!generated ? (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <UserRoundCheck className="h-4 w-4" /> Section owner
            </div>
            {canManage ? (
              <select
                aria-label={`Owner for ${section.title}`}
                value={narrative?.assignment?.assignee.id ?? ""}
                disabled={assignmentSaving}
                onChange={(event) => void onChangeAssignment(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground disabled:opacity-50"
              >
                <option value="">Unassigned</option>
                {contributors.map((person) => (
                  <option key={person.userId} value={person.userId}>{person.userName}</option>
                ))}
              </select>
            ) : (
              <p>{narrative?.assignment?.assignee.name ?? "Unassigned"}</p>
            )}
            {narrative?.assignment ? (
              <p className="text-xs">
                Assigned by {narrative.assignment.assignedBy.name} · {new Date(narrative.assignment.assignedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        ) : null}

        {!generated ? (
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <History className="h-4 w-4" /> Revision history
            </div>
            {narrative?.recentRevisions.length ? (
              <ol className="space-y-2">
                {narrative.recentRevisions.map((revision) => (
                  <li key={revision.id} className="rounded-md bg-slate-50 p-2 text-xs">
                    <div className="font-medium text-foreground">Revision {revision.revisionNumber}</div>
                    <div>{revision.createdBy?.name ?? "Unknown editor"}</div>
                    <div>{new Date(revision.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs">No saved revisions yet.</p>
            )}
          </div>
        ) : null}

        <p className="border-t pt-3 text-xs">Workflow/readiness indicators are not AUN-QA compliance scores.</p>
      </div>
    </div>
  );
}