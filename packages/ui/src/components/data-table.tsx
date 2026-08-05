import * as React from "react";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { cn } from "../lib/cn.ts";
import { Checkbox } from "./ui/checkbox.tsx";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

export interface DataTableAction<T> {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (row: T) => void;
  tone?: "default" | "danger";
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Render a leading drag-handle affordance (visual only for now). */
  dragHandle?: boolean;
  /** Row selection checkboxes. */
  selectable?: boolean;
  selectedIds?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** Built-in edit/delete convenience actions. */
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  /** Additional per-row actions rendered before edit/delete. */
  actions?: DataTableAction<T>[];
  loading?: boolean;
  emptyMessage?: string;
}

const alignClass = { left: "text-left", right: "text-right", center: "text-center" } as const;

/** Generic data table matching the Noviq moodboard rows. */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  dragHandle = false,
  selectable = false,
  selectedIds = [],
  onSelectedChange,
  onEdit,
  onDelete,
  actions = [],
  loading = false,
  emptyMessage = "No records found.",
}: DataTableProps<T>) {
  const hasActions = Boolean(onEdit || onDelete || actions.length > 0);
  const selected = new Set(selectedIds);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(getRowId(r)));

  const toggleAll = (checked: boolean) => {
    onSelectedChange?.(checked ? rows.map(getRowId) : []);
  };
  const toggleRow = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedChange?.([...next]);
  };

  const leadingCols = (dragHandle ? 1 : 0) + (selectable ? 1 : 0);
  const totalCols = leadingCols + columns.length + (hasActions ? 1 : 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {dragHandle ? <th className="w-8 px-3 py-3" /> : null}
            {selectable ? (
              <th className="w-10 px-3 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => toggleAll(Boolean(c))}
                  aria-label="Select all"
                />
              </th>
            ) : null}
            {columns.map((col) => (
              <th key={col.key} className={cn("px-3 py-3", alignClass[col.align ?? "left"])}>
                {col.header}
              </th>
            ))}
            {hasActions ? <th className="px-3 py-3 text-right">Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={totalCols} className="px-3 py-10 text-center text-muted-foreground">
                Loading…
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={totalCols} className="px-3 py-10 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const id = getRowId(row);
              return (
                <tr key={id} className="border-b border-border/60 last:border-0 hover:bg-muted/50">
                  {dragHandle ? (
                    <td className="px-3 py-3 text-muted-foreground">
                      <GripVertical className="h-4 w-4 cursor-grab" aria-hidden />
                    </td>
                  ) : null}
                  {selectable ? (
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selected.has(id)}
                        onCheckedChange={(c) => toggleRow(id, Boolean(c))}
                        aria-label="Select row"
                      />
                    </td>
                  ) : null}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn("px-3 py-3 text-foreground", alignClass[col.align ?? "left"], col.className)}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                  {hasActions ? (
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {actions.map((action) => (
                          <button
                            key={action.key}
                            onClick={() => action.onClick(row)}
                            className={cn(
                              "rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium hover:bg-muted",
                              action.tone === "danger" ? "text-status-live" : "text-foreground",
                            )}
                          >
                            {action.icon}
                            {action.label}
                          </button>
                        ))}
                        {onEdit ? (
                          <button
                            onClick={() => onEdit(row)}
                            aria-label="Edit"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        ) : null}
                        {onDelete ? (
                          <button
                            onClick={() => onDelete(row)}
                            aria-label="Delete"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-status-live-bg hover:text-status-live"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
