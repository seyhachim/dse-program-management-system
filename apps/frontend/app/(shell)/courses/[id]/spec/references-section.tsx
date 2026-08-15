"use client";

import { useState } from "react";
import { BookOpen, ExternalLink, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@dse-pms/ui";
import {
  REFERENCE_KINDS,
  referenceKindLabel,
  type ReferenceKind,
} from "@dse-pms/shared-types";
import type { ReferencesForm } from "./references-model";

export function ReferencesSectionForm({
  value,
  onPersist,
}: {
  value: ReferencesForm;
  onPersist: (items: ReferencesForm) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ReferencesForm>(value);
  const [saving, setSaving] = useState(false);
  const hasBlankTitle = draft.some((item) => item.title.trim().length === 0);

  const updateItem = (id: string, patch: Partial<ReferencesForm[number]>) => {
    setDraft((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const addReference = () => {
    setDraft((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind: "REQUIRED",
        title: "",
        authors: "",
        publisher: "",
        year: "",
        isbn: "",
        url: "",
        basedOn: "",
        notes: "",
      },
    ]);
  };

  const removeReference = (id: string) => {
    setDraft((current) => current.filter((item) => item.id !== id));
  };

  const save = async () => {
    setSaving(true);
    try {
      const ok = await onPersist(draft);
      if (ok) setDraft(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">References / Textbooks</h2>
          <p className="text-sm text-muted-foreground">
            Record the required and recommended readings for this course.
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={saving || hasBlankTitle}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Saving..." : "Save References"}
        </Button>
      </div>

      {hasBlankTitle ? (
        <p className="text-xs text-destructive">
          Every reference needs a title before you can save.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={addReference}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Reference
        </Button>
      </div>

      {draft.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">No references recorded</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add a textbook or reading. Saving an empty list records that no references have been confirmed.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {draft.map((item, index) => (
            <section key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Reference {index + 1}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Citation details</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeReference(item.id)} aria-label="Remove reference">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-foreground">Kind</span>
                  <select
                    value={item.kind}
                    onChange={(event) => updateItem(item.id, { kind: event.target.value as ReferenceKind })}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  >
                    {REFERENCE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>{referenceKindLabel(kind)}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-foreground">Title</span>
                  <input
                    value={item.title}
                    onChange={(event) => updateItem(item.id, { title: event.target.value })}
                    placeholder="e.g. Introduction to Algorithms"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-foreground">Authors</span>
                  <input
                    value={item.authors}
                    onChange={(event) => updateItem(item.id, { authors: event.target.value })}
                    placeholder="e.g. Cormen, Leiserson, Rivest, Stein"
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-foreground">Publisher</span>
                  <input
                    value={item.publisher}
                    onChange={(event) => updateItem(item.id, { publisher: event.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-foreground">Year</span>
                  <input
                    value={item.year}
                    onChange={(event) => updateItem(item.id, { year: event.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-medium text-foreground">ISBN</span>
                  <input
                    value={item.isbn}
                    onChange={(event) => updateItem(item.id, { isbn: event.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-foreground">Link (optional)</span>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={item.url}
                      onChange={(event) => updateItem(item.id, { url: event.target.value })}
                      placeholder="https://..."
                      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                    />
                    {item.url ? (
                      <a href={item.url} target="_blank" rel="noreferrer" aria-label="Open reference link" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-foreground">Based On (edition, chapters, etc.)</span>
                  <input
                    value={item.basedOn}
                    onChange={(event) => updateItem(item.id, { basedOn: event.target.value })}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-foreground">Notes</span>
                  <textarea
                    value={item.notes}
                    onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                    placeholder="Availability, access requirements, or other notes"
                    className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </label>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
