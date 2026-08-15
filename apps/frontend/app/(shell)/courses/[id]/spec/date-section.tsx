"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button, Input } from "@dse-pms/ui";
import type { DateSection as DateSectionValue } from "@dse-pms/shared-types";

export const EMPTY_DATE: DateSectionValue = { date: null };

export function DateSection({
  value,
  onPersist,
  disabled = false,
}: {
  value: DateSectionValue;
  onPersist: (value: DateSectionValue) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<DateSectionValue>(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const save = async () => {
    setSaving(true);
    try {
      if (await onPersist(draft)) {
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Date</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The date this course specification was last revised or approved.
        </p>
      </div>

      <section className="max-w-xs rounded-xl border border-border bg-card p-5">
        <label
          htmlFor="spec-date"
          className="text-sm font-semibold text-foreground"
        >
          Spec Date
        </label>
        <Input
          id="spec-date"
          type="date"
          value={draft.date ?? ""}
          disabled={disabled || saving}
          onChange={(event) => {
            setDraft({ date: event.target.value || null });
            setSaved(false);
          }}
          className="mt-2"
        />
      </section>

      <div className="flex items-center justify-end gap-3">
        {saved ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="h-4 w-4" />
            Saved
          </span>
        ) : null}

        <Button onClick={save} disabled={disabled || saving}>
          {saving ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          ) : (
            "Save Date"
          )}
        </Button>
      </div>
    </div>
  );
}
