"use client";

import { useMemo, useState } from "react";
import { formatLecturerDisplayName, type Lecturer } from "@dse-pms/shared-types";
import { Input } from "@dse-pms/ui";

/** Searchable multi-select checkbox list for offering co-lecturers. */
export function LecturerChecklist({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  options: Lecturer[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = new Set(selectedIds);
  const selectedLecturers = options.filter((lecturer) => selected.has(lecturer.id));
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((lecturer) =>
      [lecturer.name, lecturer.email, lecturer.title, lecturer.qualification]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [options, query]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <legend className="text-sm font-semibold text-foreground">
            {label} <span className="font-normal text-muted-foreground">(Optional)</span>
          </legend>
          <p className="text-xs text-muted-foreground">
            Search and tick one or more lecturers. The primary lecturer is excluded automatically.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-medium text-foreground">
          {selectedIds.length} selected
        </span>
      </div>

      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          No other lecturers available.
        </p>
      ) : (
        <>
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, or academic position…"
            aria-label="Search co-lecturers"
          />

          {selectedLecturers.length > 0 ? (
            <div className="flex flex-wrap gap-2" aria-label="Selected co-lecturers">
              {selectedLecturers.map((lecturer) => (
                <button
                  key={lecturer.id}
                  type="button"
                  onClick={() => toggle(lecturer.id)}
                  className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground hover:bg-muted/70"
                  title="Remove co-lecturer"
                >
                  {formatLecturerDisplayName(lecturer.name, lecturer.honorific)} ×
                </button>
              ))}
              <button
                type="button"
                onClick={() => onChange([])}
                className="px-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
              >
                Clear all
              </button>
            </div>
          ) : null}

          {filteredOptions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              No lecturers match “{query.trim()}”. Your existing selections are unchanged.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2">
              {filteredOptions.map((lecturer) => (
                <li key={lecturer.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      checked={selected.has(lecturer.id)}
                      onChange={() => toggle(lecturer.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {formatLecturerDisplayName(lecturer.name, lecturer.honorific)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {lecturer.email}
                        {lecturer.title ? ` · ${lecturer.title}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </fieldset>
  );
}
