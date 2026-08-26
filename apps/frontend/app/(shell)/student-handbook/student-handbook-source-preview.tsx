"use client";

import { AlertCircle, Database, ExternalLink, X } from "lucide-react";
import type { StudentHandbookSourcePreview } from "@dse-pms/shared-types";
import { studentHandbookSourceLabel } from "@/lib/student-handbook-source-catalog";
import { getStudentHandbookUnavailableSourceState } from "@/lib/student-handbook-source-state";
import {
  safeStudentHandbookSourceUrl,
  studentHandbookSourceEntries,
  studentHandbookSourceFieldLabel,
  studentHandbookSourceValueKind,
} from "./student-handbook-source-preview-data";

function SourceValue({ fieldKey, value }: { fieldKey: string; value: unknown }) {
  if (typeof value === "string") {
    const kind = studentHandbookSourceValueKind(fieldKey, value);
    if (kind === "email") {
      return <a href={`mailto:${value}`} className="break-all font-medium text-primary hover:underline">{value}</a>;
    }
    if (kind === "phone") {
      return <a href={`tel:${value.replace(/[^+\d]/g, "")}`} className="font-medium text-primary hover:underline">{value}</a>;
    }
    if (kind === "url") {
      const href = safeStudentHandbookSourceUrl(value);
      if (href) {
        return (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-start gap-1.5 break-all font-medium text-primary hover:underline">
            <span>{value}</span>
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          </a>
        );
      }
    }
    return <span className="whitespace-pre-wrap break-words">{value}</span>;
  }

  if (typeof value === "number") return <span className="font-semibold tabular-nums">{value.toLocaleString()}</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;

  if (Array.isArray(value)) {
    return (
      <ul className="space-y-1.5 pl-4">
        {value.map((item, index) => (
          <li key={index} className="list-disc break-words">
            <SourceValue fieldKey={fieldKey} value={item} />
          </li>
        ))}
      </ul>
    );
  }

  const nestedEntries = studentHandbookSourceEntries(value);
  if (nestedEntries.length > 0) {
    return (
      <div className="space-y-2 rounded-lg bg-muted/40 p-3">
        {nestedEntries.map(([key, nestedValue]) => (
          <div key={key} className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3">
            <span className="text-xs font-medium text-muted-foreground">{studentHandbookSourceFieldLabel(key)}</span>
            <div className="min-w-0 text-sm text-foreground"><SourceValue fieldKey={key} value={nestedValue} /></div>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-muted-foreground">—</span>;
}

function ReadableSourceData({ preview }: { preview: StudentHandbookSourcePreview }) {
  const entries = studentHandbookSourceEntries(preview.data);
  const programmeName = entries.find(([key]) => key === "programmeName")?.[1];
  const shortName = entries.find(([key]) => key === "shortName")?.[1];
  const overview = entries.find(([key]) => key === "overview")?.[1];
  const detailEntries = entries.filter(([key]) => !["programmeName", "shortName", "overview"].includes(key));

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/20 p-5 text-sm text-foreground">
        <SourceValue fieldKey="value" value={preview.data} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {typeof programmeName === "string" ? (
        <div className="rounded-xl border bg-gradient-to-br from-emerald-50/70 to-background p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold leading-7 text-foreground">{programmeName}</h3>
            {typeof shortName === "string" ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{shortName}</span> : null}
          </div>
        </div>
      ) : null}

      {typeof overview === "string" ? (
        <section>
          <h3 className="text-sm font-semibold text-foreground">Overview</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-foreground/90">{overview}</p>
        </section>
      ) : null}

      {detailEntries.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-foreground">Details</h3>
          <dl className="mt-2 divide-y rounded-xl border bg-background">
            {detailEntries.map(([key, value]) => (
              <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4">
                <dt className="text-xs font-medium leading-6 text-muted-foreground">{studentHandbookSourceFieldLabel(key)}</dt>
                <dd className="min-w-0 text-sm leading-6 text-foreground"><SourceValue fieldKey={key} value={value} /></dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <details className="rounded-xl border bg-muted/20">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">Technical data</summary>
        <div className="border-t p-4">
          <p className="mb-3 text-xs leading-5 text-muted-foreground">Exact read-only payload returned by the PMS source. Useful for audit and debugging.</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/60 p-4 text-xs leading-6 text-foreground">{JSON.stringify(preview.data, null, 2)}</pre>
        </div>
      </details>
    </div>
  );
}

export function SourcePreviewModal({ preview, onClose }: { preview: StudentHandbookSourcePreview; onClose: () => void }) {
  const unavailable = getStudentHandbookUnavailableSourceState(preview);
  const sourceTitle = studentHandbookSourceLabel(preview.kind);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label={`${sourceTitle} source preview`} className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-card shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 shrink-0 text-emerald-600" />
              <h2 className="truncate font-semibold text-foreground">{unavailable?.title ?? sourceTitle}</h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{preview.label}</span>
              <span aria-hidden="true">·</span>
              <span>Authoritative PMS data</span>
              <span aria-hidden="true">·</span>
              <span>Read only</span>
              {preview.snapshot ? <><span aria-hidden="true">·</span><span className="font-medium text-emerald-700">Published snapshot</span></> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close source preview">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {unavailable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <p className="font-medium text-foreground">{unavailable.message}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{unavailable.explanation}</p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                    <Database className="h-3.5 w-3.5" /> Read-only PMS source
                  </div>
                </div>
              </div>
            </div>
          ) : <ReadableSourceData preview={preview} />}
        </div>
      </div>
    </div>
  );
}
