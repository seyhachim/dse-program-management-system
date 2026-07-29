"use client";

import type { Lecturer } from "@dse-pms/shared-types";

/**
 * A multi-select checkbox list of lecturers — the co-lecturer picker (issue
 * #73). Mirrors the §14 CLO method checklist's visual pattern
 * (spec/method-checklist.tsx), kept as its own component since it's scoped to
 * the Course admin form rather than the spec wizard.
 */
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
  const selected = new Set(selectedIds);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium text-foreground">
        {label} <span className="text-muted-foreground">({selectedIds.length})</span>
      </span>
      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          No other lecturers available.
        </p>
      ) : (
        <ul className="space-y-1 rounded-lg border border-border bg-card p-3">
          {options.map((l) => (
            <li key={l.id}>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  checked={selected.has(l.id)}
                  onChange={() => toggle(l.id)}
                />
                {l.name}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
