"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@dse-pms/ui";
import type { StudentResponsibilitySection as StudentResponsibilityValue } from "@dse-pms/shared-types";

export const EMPTY_STUDENT_RESPONSIBILITY: StudentResponsibilityValue = {
  items: [],
};

export const AUN_RESPONSIBILITY_EXAMPLES = [
  "Read the learning materials beforehand which means to be ready for the next session.",
  "Be completely engaged in class, active, take notes, and ask questions in class.",
  "Students are required to participate in various activities in and out of the classroom, such as group work, and individual homework for assignments and reports assigned by the subject teacher.",
  "Submit the assigned tasks such as homework, assignments, or research proposal on time.",
] as const;

function normalized(value: StudentResponsibilityValue): StudentResponsibilityValue {
  return {
    items: value.items
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0),
  };
}

export function responsibilityIsDirty(
  draft: StudentResponsibilityValue,
  saved: StudentResponsibilityValue,
): boolean {
  const a = normalized(draft);
  const b = normalized(saved);
  if (a.items.length !== b.items.length) return true;
  return a.items.some(
    (item, index) =>
      item.id !== b.items[index]?.id || item.text !== b.items[index]?.text,
  );
}

export function StudentResponsibilitySection({
  value,
  onPersist,
  disabled = false,
}: {
  value: StudentResponsibilityValue;
  onPersist: (value: StudentResponsibilityValue) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [items, setItems] = useState(value.items);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setItems(value.items);
    setEditing(null);
  }, [value]);

  const draft = useMemo(() => ({ items }), [items]);
  const dirty = useMemo(() => responsibilityIsDirty(draft, value), [draft, value]);

  const update = (id: string, text: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, text } : item)),
    );
    setSaved(false);
  };

  const add = (text = "") => {
    const id = crypto.randomUUID();
    setItems((current) => [...current, { id, text }]);
    setExpanded(id);
    setEditing(id);
    setSaved(false);
  };

  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    if (expanded === id) setExpanded(null);
    if (editing === id) setEditing(null);
    setSaved(false);
  };

  const discard = () => {
    setItems(value.items);
    setExpanded(null);
    setEditing(null);
    setSaved(false);
  };

  const save = async () => {
    const cleaned = normalized({ items });
    setSaving(true);
    setSaved(false);
    try {
      if (await onPersist(cleaned)) {
        setItems(cleaned.items);
        setEditing(null);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-foreground">Student Responsibilities</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Keep student expectations concise and specific to successful participation in this course.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {items.length} {items.length === 1 ? "responsibility" : "responsibilities"}
        </span>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border bg-background">
        <button
          type="button"
          onClick={() => setExamplesOpen((open) => !open)}
          className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-muted/40"
          aria-expanded={examplesOpen}
        >
          {examplesOpen ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Examples from the AUN course specification</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Optional starting points. Examples are never saved unless you explicitly add and save them.
            </p>
          </div>
        </button>

        {examplesOpen ? (
          <div className="space-y-2 border-t border-border bg-muted/20 p-3">
            {AUN_RESPONSIBILITY_EXAMPLES.map((example) => (
              <div key={example} className="flex items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
                <span className="mt-0.5 flex-1 text-sm leading-6 text-foreground">{example}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => add(example)}
                  disabled={disabled || saving}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Course responsibilities</h3>
          <p className="mt-1 text-xs text-muted-foreground">Expand a responsibility to review or edit it.</p>
        </div>
        {!disabled ? (
          <Button type="button" variant="outline" size="sm" onClick={() => add()} disabled={saving}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </Button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2.5">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">
            No course-specific student responsibilities yet. Add one or start from an AUN example above.
          </div>
        ) : (
          items.map((item, index) => {
            const isExpanded = expanded === item.id;
            const isEditing = editing === item.id;
            const preview = item.text.trim() || "New responsibility";

            return (
              <section key={item.id} className="overflow-hidden rounded-xl border border-border bg-background">
                <button
                  type="button"
                  onClick={() => {
                    if (isEditing) return;
                    setExpanded((current) => (current === item.id ? null : item.id));
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-muted/40"
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Responsibility {index + 1}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-foreground">{preview}</p>
                  </div>
                </button>

                {isExpanded ? (
                  <div className="border-t border-border px-4 py-4">
                    {isEditing ? (
                      <>
                        <textarea
                          value={item.text}
                          onChange={(event) => update(item.id, event.target.value)}
                          disabled={saving}
                          rows={4}
                          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                          placeholder="Example: Submit assigned work on time."
                          aria-label={`Responsibility ${index + 1}`}
                        />
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(item.id)}
                            disabled={saving}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                            Done editing
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{preview}</p>
                        {!disabled ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(item.id)}>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </section>
            );
          })
        )}
      </div>

      {dirty && !disabled ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/70 bg-amber-50/70 px-3.5 py-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          <span className="text-xs font-medium text-amber-800 dark:text-amber-200">Unsaved changes</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? (
                <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</span>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </div>
      ) : saved ? (
        <div className="mt-5 flex items-center justify-end gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="h-4 w-4" /> Saved
        </div>
      ) : null}
    </section>
  );
}
