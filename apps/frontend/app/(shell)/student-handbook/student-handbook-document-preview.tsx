"use client";

import { useState } from "react";
import type {
  StudentHandbookDocumentTheme,
  StudentHandbookView,
} from "@dse-pms/shared-types";
import { Database, Download, FileText, Loader2 } from "lucide-react";
import { DocumentRenderer, type DocumentRendererTheme } from "@/components/document-editor/document-renderer";
import {
  buildStudentHandbookExportModel,
  type StudentHandbookExportSource,
} from "@/lib/student-handbook-export-model";
import {
  exportStudentHandbookDocx,
  exportStudentHandbookPdf,
} from "@/lib/student-handbook-export";

function rendererTheme(theme: StudentHandbookDocumentTheme): DocumentRendererTheme {
  return {
    fontFamily: theme.bodyFontFamily,
    bodyFontSize: `${theme.bodyFontSizePt}pt`,
    lineHeight: theme.lineHeight,
    paragraphSpacing: `${theme.paragraphSpacingPt}pt`,
    defaultAlignment: theme.defaultAlignment,
    heading1Size: `${theme.heading1SizePt}pt`,
    heading2Size: `${theme.heading2SizePt}pt`,
    heading3Size: `${theme.heading3SizePt}pt`,
  };
}

function SourceDataPreview({ source }: { source: StudentHandbookExportSource }) {
  if (source.unavailable) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50/60 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <Database className="h-4 w-4" /> {source.label}
        </div>
        <p className="mt-1 text-muted-foreground">
          {source.message ?? "PMS source data is unavailable."}
        </p>
      </div>
    );
  }

  if (source.rows.length > 0) {
    return (
      <div className="overflow-hidden rounded border">
        <div className="flex items-center gap-2 border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
          <Database className="h-4 w-4" /> {source.label}
          {source.snapshot ? (
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-emerald-700">
              Published snapshot
            </span>
          ) : null}
        </div>
        <dl className="divide-y text-sm">
          {source.rows.map((row) => (
            <div key={row.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[160px_1fr]">
              <dt className="font-medium text-slate-600">{row.key}</dt>
              <dd className="break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded border p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <Database className="h-4 w-4" /> {source.label}
      </div>
      <p className="mt-1 break-words">{source.text ?? ""}</p>
    </div>
  );
}

export function StudentHandbookDocumentPreview({
  handbook,
  theme,
}: {
  handbook: StudentHandbookView;
  theme: StudentHandbookDocumentTheme;
}) {
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const model = buildStudentHandbookExportModel(handbook, theme);
  const docTheme = rendererTheme(model.theme);
  const previewRootId = `student-handbook-export-${model.handbookId}`;

  async function exportDocx() {
    setExporting("docx");
    setExportError(null);
    try {
      await exportStudentHandbookDocx(model);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export DOCX");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    const previewRoot = document.getElementById(previewRootId);
    if (!previewRoot) return;
    setExporting("pdf");
    setExportError(null);
    try {
      await exportStudentHandbookPdf(model, previewRoot);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not export PDF");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-3 rounded-xl border bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Export handbook</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {model.draft
              ? "Draft exports are visibly marked and are not official published handbooks."
              : "Published exports use this edition’s frozen PMS source snapshots and document style."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void exportDocx()}
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting === "docx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            DOCX
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void exportPdf()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF
          </button>
        </div>
      </div>

      {exportError ? (
        <p className="mx-auto w-full max-w-[210mm] rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {exportError}
        </p>
      ) : null}

      <div id={previewRootId} className="space-y-8">
        {model.sections.map((section, sectionIndex) => (
          <article
            key={section.id}
            data-student-handbook-export-page="true"
            className="relative mx-auto w-full max-w-[210mm] bg-white text-slate-950 shadow-lg ring-1 ring-slate-200"
            style={{
              minHeight: "297mm",
              paddingTop: `${model.theme.marginsMm.top}mm`,
              paddingBottom: `${model.theme.marginsMm.bottom}mm`,
              paddingLeft: `${model.theme.marginsMm.left}mm`,
              paddingRight: `${model.theme.marginsMm.right}mm`,
              fontFamily: model.theme.bodyFontFamily,
              fontSize: `${model.theme.bodyFontSizePt}pt`,
            }}
          >
            {model.theme.showHeader ? (
              <header className="absolute left-0 right-0 top-0 flex h-12 items-center justify-between border-b px-8 text-[9pt] text-slate-500">
                <span>{model.title}</span>
                <span>v{model.version}</span>
              </header>
            ) : null}

            {model.draft ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                <span className="-rotate-45 select-none text-7xl font-bold tracking-[0.2em] text-slate-100">DRAFT</span>
              </div>
            ) : null}

            <div className="relative">
              <h1 className="mb-6 font-bold" style={{ fontSize: `${model.theme.heading1SizePt}pt` }}>
                {sectionIndex + 1}. {section.title}
              </h1>
              <div className="space-y-5">
                {section.blocks.length === 0 ? (
                  <p className="italic text-slate-400">No content yet.</p>
                ) : null}
                {section.blocks.map((block) =>
                  block.type === "NARRATIVE" ? (
                    <DocumentRenderer key={block.id} value={block.document} theme={docTheme} />
                  ) : (
                    <SourceDataPreview key={block.id} source={block.source} />
                  ),
                )}
              </div>
            </div>

            {model.theme.showFooter ? (
              <footer className="absolute bottom-0 left-0 right-0 flex h-12 items-center justify-between border-t px-8 text-[9pt] text-slate-500">
                <span>Data Science and Engineering</span>
                {model.theme.showPageNumbers ? <span>Page {sectionIndex + 1}</span> : null}
              </footer>
            ) : model.theme.showPageNumbers ? (
              <div className="absolute bottom-4 right-8 text-[9pt] text-slate-500">Page {sectionIndex + 1}</div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
