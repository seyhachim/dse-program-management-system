"use client";

import { useMemo, useState } from "react";
import { Check, Database, Search, Sparkles, X } from "lucide-react";
import type { StudentHandbookSourceKind } from "@dse-pms/shared-types";
import {
  filterStudentHandbookSources,
  recommendedStudentHandbookSources,
  STUDENT_HANDBOOK_SOURCE_OPTIONS,
  type StudentHandbookSourceOption,
} from "@/lib/student-handbook-source-catalog";

function SourceChoice({
  option,
  selected,
  alreadyAdded,
  onToggle,
}: {
  option: StudentHandbookSourceOption;
  selected: boolean;
  alreadyAdded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={alreadyAdded}
      onClick={onToggle}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
        alreadyAdded
          ? "cursor-not-allowed border-muted bg-muted/30 opacity-60"
          : selected
            ? "border-emerald-400 bg-emerald-50"
            : "border-border bg-background hover:border-emerald-200 hover:bg-emerald-50/40"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
          selected
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-muted-foreground/30 bg-background"
        }`}
        aria-hidden="true"
      >
        {selected ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{option.label}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {option.category}
          </span>
          {alreadyAdded ? (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
              Already added
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
          {option.description}
        </span>
      </span>
    </button>
  );
}

export function StudentHandbookSourceBrowser({
  sectionKey,
  existingKinds,
  onClose,
  onInsert,
}: {
  sectionKey: string;
  existingKinds: StudentHandbookSourceKind[];
  onClose: () => void;
  onInsert: (kinds: StudentHandbookSourceKind[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<StudentHandbookSourceKind[]>([]);
  const existing = useMemo(() => new Set(existingKinds), [existingKinds]);
  const recommendations = useMemo(
    () => recommendedStudentHandbookSources(sectionKey),
    [sectionKey],
  );
  const filtered = useMemo(() => filterStudentHandbookSources(query), [query]);
  const categories = useMemo(
    () => Array.from(new Set(STUDENT_HANDBOOK_SOURCE_OPTIONS.map((option) => option.category))),
    [],
  );

  function toggle(kind: StudentHandbookSourceKind) {
    if (existing.has(kind)) return;
    setSelectedKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border bg-card shadow-xl sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-foreground">Insert PMS Data</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose one or more published, read-only PMS sources for this section.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted"
            aria-label="Close source browser"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b p-4 sm:px-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search curriculum, contacts, programme…"
              className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:px-5">
          {!query && recommendations.length > 0 ? (
            <section className="mb-6">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Recommended for this section
              </div>
              <div className="space-y-2">
                {recommendations.map((option) => (
                  <SourceChoice
                    key={`recommended-${option.kind}`}
                    option={option}
                    selected={selectedKinds.includes(option.kind)}
                    alreadyAdded={existing.has(option.kind)}
                    onToggle={() => toggle(option.kind)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm font-medium text-foreground">No PMS data found</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a different search term.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {categories.map((category) => {
                const options = filtered.filter((option) => option.category === category);
                if (!options.length) return null;
                return (
                  <section key={category}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {category}
                    </h3>
                    <div className="space-y-2">
                      {options.map((option) => (
                        <SourceChoice
                          key={option.kind}
                          option={option}
                          selected={selectedKinds.includes(option.kind)}
                          alreadyAdded={existing.has(option.kind)}
                          onToggle={() => toggle(option.kind)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-muted-foreground">
            {selectedKinds.length
              ? `${selectedKinds.length} source${selectedKinds.length === 1 ? "" : "s"} selected`
              : "Select a source to insert"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border px-4 py-2 text-sm font-medium sm:flex-none"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={selectedKinds.length === 0}
              onClick={() => onInsert(selectedKinds)}
              className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              Insert {selectedKinds.length || ""} {selectedKinds.length === 1 ? "block" : "blocks"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
