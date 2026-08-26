"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, FileCheck2, Save } from "lucide-react";
import type {
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

const PROGRAMME_ID = "dse";

type Selection =
  | { kind: "static"; section: QaSarBookSection }
  | { kind: "requirement"; section: QaSarBookSection };

export function SarBookClient() {
  const { me, loading: meLoading } = useMe();
  const [book, setBook] = useState<QaSarBookView | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [narrative, setNarrative] = useState<QaSarBookNarrativeSectionView | null>(null);
  const [document, setDocument] = useState<DseDocumentContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leadershipOrReviewer =
    me?.roles.some((role) => ["admin", "program_coordinator", "qa_reviewer"].includes(role)) ?? false;

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
        return;
      }

      const loaded = await api.get<QaSarBookView>(`/api/qa/cycles/${cycleId}/sar-book?${params}`);
      setBook(loaded);
      const first = loaded.parts[0]?.sections[0];
      if (first) setSelection({ kind: "static", section: first });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load the SAR book");
    } finally {
      setLoading(false);
    }
  }, [leadershipOrReviewer, me]);

  useEffect(() => {
    if (!meLoading && me) void loadBook();
  }, [loadBook, me, meLoading]);

  useEffect(() => {
    if (!book || !selection || selection.kind !== "static") {
      setNarrative(null);
      setDocument(null);
      return;
    }
    if (selection.section.source === "generated") {
      setNarrative(null);
      setDocument(null);
      return;
    }

    let cancelled = false;
    setSectionLoading(true);
    setError(null);
    const params = new URLSearchParams({ programmeId: PROGRAMME_ID });
    void api
      .get<QaSarBookNarrativeSectionView>(
        `/api/qa/cycles/${book.cycleId}/sar-book/sections/${encodeURIComponent(selection.section.key)}?${params}`,
      )
      .then((loaded) => {
        if (cancelled) return;
        setNarrative(loaded);
        setDocument(parseStoredDocumentContent(loaded.content));
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Could not load SAR book section");
      })
      .finally(() => {
        if (!cancelled) setSectionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [book, selection]);

  const selectedPartTitle = useMemo(() => {
    if (!book || !selection) return "";
    return book.parts.find((part) =>
      part.sections.some((section) => section.key === selection.section.key) ||
      part.criteria.some((criterion) => criterion.sections.some((section) => section.key === selection.section.key)),
    )?.title ?? "";
  }, [book, selection]);

  async function save() {
    if (!book || !selection || selection.kind !== "static" || !narrative?.editable || !document) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.put<QaSarBookNarrativeSectionView>(
        `/api/qa/cycles/${book.cycleId}/sar-book/sections/${encodeURIComponent(selection.section.key)}`,
        { programmeId: PROGRAMME_ID, content: serializeDocumentContent(document) },
      );
      setNarrative(saved);
      setDocument(parseStoredDocumentContent(saved.content));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save SAR book section");
    } finally {
      setSaving(false);
    }
  }

  if (meLoading || loading) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">Loading complete SAR book…</div>;
  }

  if (!book) {
    return <div className="rounded-xl border bg-white p-8 text-sm text-muted-foreground">No accessible AUN-QA assessment cycle was found.</div>;
  }

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
            <Link href="/aun-qa/evidence" className="rounded-md border px-3 py-2">Evidence</Link>
            <Link href="/aun-qa/review" className="rounded-md border px-3 py-2">Review</Link>
            <Link href="/aun-qa/sar-preview" className="rounded-md border px-3 py-2">Preview</Link>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3"><strong>{book.totals.criteria}</strong> criteria</div>
          <div className="rounded-lg bg-slate-50 p-3"><strong>{book.totals.requirements}</strong> requirement sections</div>
          <div className="rounded-lg bg-slate-50 p-3"><strong>{book.lineage.length}</strong> official release{book.lineage.length === 1 ? "" : "s"}</div>
        </div>
      </header>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)] xl:grid-cols-[330px_minmax(0,1fr)_280px]">
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
                      onClick={() => setSelection({ kind: "static", section })}
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
                            href={`/aun-qa/sar/${section.requirementCode}`}
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
          ) : selection.kind === "requirement" ? null : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{selectedPartTitle}</div>
                  <h2 className="text-lg font-semibold">{selection.section.title}</h2>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {selection.section.source === "generated" ? "Generated from canonical PMS evidence" : narrative?.updatedByName ? `Last edited by ${narrative.updatedByName}` : "Not written yet"}
                  </div>
                </div>
                {narrative?.editable && selection.section.source !== "generated" ? (
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || sectionLoading}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save section"}
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
                    <div className="rounded-lg border p-4"><DocumentRenderer value={document} /></div>
                  )
                ) : (
                  <div className="text-sm text-muted-foreground">This structured section is prepared here and receives its dedicated fields in the later Part 3/evidence phases.</div>
                )}
              </div>
            </>
          )}
        </main>

        <aside className="hidden rounded-xl border bg-white p-4 xl:block xl:sticky xl:top-4 xl:self-start">
          <div className="text-sm font-semibold">Section context</div>
          {selection ? (
            <div className="mt-3 space-y-3 text-sm text-muted-foreground">
              <p>{selection.section.required ? "Required SAR section" : "Optional SAR section"}</p>
              <p>Source: {selection.section.source === "requirementSar" ? "Requirement SAR workflow" : selection.section.source === "generated" ? "Generated PMS data" : "SAR book content"}</p>
              <p>Workflow/readiness indicators are not AUN-QA compliance scores.</p>
              {selection.section.requirementCode ? <Link href={`/aun-qa/sar/${selection.section.requirementCode}`} className="font-medium text-primary hover:underline">Open requirement editor</Link> : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
