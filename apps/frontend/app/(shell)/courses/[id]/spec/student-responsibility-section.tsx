"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@dse-pms/ui";
import type { StudentResponsibilitySection as StudentResponsibilityValue } from "@dse-pms/shared-types";

export const EMPTY_STUDENT_RESPONSIBILITY: StudentResponsibilityValue = {
  items: [],
};

const EXAMPLES = [
  "Read the learning materials beforehand which means to be ready for the next session.",
  "Be completely engaged in class, active, take notes, and ask questions in class.",
  "Students are required to participate in various activities in and out of the classroom, such as group work, and individual homework for assignments and reports assigned by the subject teacher.",
  "Submit the assigned tasks such as homework, assignments, or research proposal on time.",
];

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setItems(value.items), [value]);

  const update = (id: string, text: string) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, text } : item)));
    setSaved(false);
  };

  const add = (text = "") => {
    setItems((current) => [...current, { id: crypto.randomUUID(), text }]);
    setSaved(false);
  };

  const remove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setSaved(false);
  };

  const save = async () => {
    const cleaned = items
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0);
    setSaving(true);
    if (await onPersist({ items: cleaned })) {
      setItems(cleaned);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Student Responsibility</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Describe the expectations students should follow to participate successfully in this course.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-muted/30 p-5">
        <h3 className="text-sm font-semibold text-foreground">Examples from the AUN course specification</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Use these as starting points and adapt them to the actual course. They are examples, not automatic course data.
        </p>
        <div className="mt-4 grid gap-2">
          {EXAMPLES.map((example) => (
            <div key={example} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
              <span className="mt-0.5 text-muted-foreground">•</span>
              <span className="flex-1">{example}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => add(example)} disabled={disabled || saving}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Course Expectations</h3>
            <p className="mt-1 text-xs text-muted-foreground">Keep the list concise and course-specific.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => add()} disabled={disabled || saving}>
            <Plus className="mr-1 h-4 w-4" /> Add Responsibility
          </Button>
        </div>

        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
              No responsibilities added yet. Start from an example above or add your own.
            </div>
          ) : (
            items.map((item, index) => (
              <div key={item.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-muted-foreground">Responsibility {index + 1}</label>
                  <textarea
                    value={item.text}
                    onChange={(event) => update(item.id, event.target.value)}
                    disabled={disabled || saving}
                    rows={2}
                    className="mt-1 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    placeholder="Example: Submit assigned work on time."
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(item.id)} disabled={disabled || saving} aria-label={`Remove responsibility ${index + 1}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {saved ? <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> Saved</span> : null}
        <Button onClick={save} disabled={disabled || saving}>
          {saving ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving…</span> : "Save Student Responsibility"}
        </Button>
      </div>
    </div>
  );
}
