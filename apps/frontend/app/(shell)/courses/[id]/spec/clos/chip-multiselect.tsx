"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { Method } from "@dse-pms/shared-types";

/**
 * Searchable multi-select rendered as chips — replaces the long checkbox lists
 * for teaching/assessment methods in the CLO wizard (issue #94).
 */
export function ChipMultiSelect({
  label,
  options,
  selectedIds,
  onChange,
  emptyMessage = "No options defined yet.",
}: {
  label: string;
  options: Method[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const selected = useMemo(
    () => selectedIds.map((id) => options.find((o) => o.id === id)).filter((m): m is Method => !!m),
    [selectedIds, options],
  );
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => !selectedIds.includes(o.id) && (!q || o.name.toLowerCase().includes(q)));
  }, [options, selectedIds, query]);

  const add = (id: string) => onChange([...selectedIds, id]);
  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id));

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-foreground">
        {label} <span className="text-muted-foreground">({selectedIds.length})</span>
      </span>

      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((m) => (
            <li key={m.id}>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 py-1 pl-3 pr-1.5 text-sm text-accent-foreground">
                {m.name}
                <button
                  type="button"
                  aria-label={`Remove ${m.name}`}
                  onClick={() => remove(m.id)}
                  className="cursor-pointer rounded-full p-0.5 hover:bg-accent/25"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {options.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {available.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                {selected.length === options.length ? "All methods selected." : "No matches."}
              </li>
            ) : (
              available.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => add(m.id)}
                    className="cursor-pointer rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-solid hover:border-accent-foreground hover:bg-accent/15 hover:text-accent-foreground"
                  >
                    + {m.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
