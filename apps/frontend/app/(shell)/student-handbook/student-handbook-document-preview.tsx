import type {
  StudentHandbookDocumentTheme,
  StudentHandbookSourcePreview,
  StudentHandbookView,
} from "@dse-pms/shared-types";
import { Database } from "lucide-react";
import { DocumentRenderer, type DocumentRendererTheme } from "@/components/document-editor/document-renderer";
import { parseStoredDocumentContent } from "@/lib/document-content";
import { getStudentHandbookUnavailableSourceState } from "@/lib/student-handbook-source-state";

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

function SourceDataPreview({ preview, label }: { preview: StudentHandbookSourcePreview | null; label: string }) {
  if (!preview) {
    return (
      <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
        {label} · source preview unavailable
      </div>
    );
  }
  const unavailable = getStudentHandbookUnavailableSourceState(preview);
  if (unavailable) {
    return (
      <div className="rounded border border-amber-200 bg-amber-50/60 p-3 text-sm">
        <p className="font-medium">{unavailable.title}</p>
        <p className="mt-1 text-muted-foreground">{unavailable.message}</p>
      </div>
    );
  }

  if (preview.data && typeof preview.data === "object" && !Array.isArray(preview.data)) {
    const entries = Object.entries(preview.data as Record<string, unknown>).slice(0, 16);
    return (
      <div className="overflow-hidden rounded border">
        <div className="flex items-center gap-2 border-b bg-slate-50 px-3 py-2 text-sm font-semibold">
          <Database className="h-4 w-4" /> {label}
        </div>
        <dl className="divide-y text-sm">
          {entries.map(([key, value]) => (
            <div key={key} className="grid gap-1 px-3 py-2 sm:grid-cols-[160px_1fr]">
              <dt className="font-medium text-slate-600">{key}</dt>
              <dd className="break-words">
                {typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                  ? String(value)
                  : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded border p-3 text-sm">
      <p className="font-medium">{label}</p>
      <p className="mt-1 break-words">{String(preview.data ?? "")}</p>
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
  const docTheme = rendererTheme(theme);
  return (
    <div className="space-y-8 pb-10">
      {handbook.sections.map((section, sectionIndex) => (
        <article
          key={section.id}
          className="relative mx-auto w-full max-w-[210mm] bg-white text-slate-950 shadow-lg ring-1 ring-slate-200"
          style={{
            minHeight: "297mm",
            paddingTop: `${theme.marginsMm.top}mm`,
            paddingBottom: `${theme.marginsMm.bottom}mm`,
            paddingLeft: `${theme.marginsMm.left}mm`,
            paddingRight: `${theme.marginsMm.right}mm`,
            fontFamily: theme.bodyFontFamily,
            fontSize: `${theme.bodyFontSizePt}pt`,
          }}
        >
          {theme.showHeader ? (
            <header className="absolute left-0 right-0 top-0 flex h-12 items-center justify-between border-b px-8 text-[9pt] text-slate-500">
              <span>{handbook.title}</span>
              <span>v{handbook.version}</span>
            </header>
          ) : null}

          {handbook.status !== "PUBLISHED" ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
              <span className="-rotate-45 select-none text-7xl font-bold tracking-[0.2em] text-slate-100">DRAFT</span>
            </div>
          ) : null}

          <div className="relative">
            <h1 className="mb-6 font-bold" style={{ fontSize: `${theme.heading1SizePt}pt` }}>
              {sectionIndex + 1}. {section.title}
            </h1>
            <div className="space-y-5">
              {section.blocks.length === 0 ? (
                <p className="italic text-slate-400">No content yet.</p>
              ) : null}
              {section.blocks.map((block) =>
                block.type === "NARRATIVE" ? (
                  <DocumentRenderer
                    key={block.id}
                    value={parseStoredDocumentContent(block.content)}
                    theme={docTheme}
                  />
                ) : (
                  <SourceDataPreview
                    key={block.id}
                    label={block.label ?? "PMS data"}
                    preview={block.sourcePreview}
                  />
                ),
              )}
            </div>
          </div>

          {theme.showFooter ? (
            <footer className="absolute bottom-0 left-0 right-0 flex h-12 items-center justify-between border-t px-8 text-[9pt] text-slate-500">
              <span>Data Science and Engineering</span>
              {theme.showPageNumbers ? <span>Page {sectionIndex + 1}</span> : null}
            </footer>
          ) : theme.showPageNumbers ? (
            <div className="absolute bottom-4 right-8 text-[9pt] text-slate-500">Page {sectionIndex + 1}</div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
