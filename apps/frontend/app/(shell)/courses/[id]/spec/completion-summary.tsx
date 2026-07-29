"use client";

import { COMPLETABLE_SPEC_SECTIONS, type SpecSectionStatus } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";

/**
 * Top-of-page completion banner (issue #47): tells a lecturer how much of the
 * spec's required (implemented, save-able) sections are done and one-click
 * jumps to whichever is next — so they don't have to inspect every tab to
 * find what's missing.
 */
export function CompletionSummary({
  status,
  onContinue,
}: {
  status: Record<string, SpecSectionStatus>;
  onContinue: (sectionId: (typeof COMPLETABLE_SPEC_SECTIONS)[number]["id"]) => void;
}) {
  const total = COMPLETABLE_SPEC_SECTIONS.length;
  const completed = COMPLETABLE_SPEC_SECTIONS.filter(
    (s) => status[s.id] === "complete",
  ).length;
  const remaining = total - completed;
  const next = COMPLETABLE_SPEC_SECTIONS.find((s) => status[s.id] !== "complete");

  return (
    <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-foreground">
          {completed} of {total} required items complete
        </p>
        <p className="text-sm text-muted-foreground">
          {remaining > 0
            ? `${remaining} item${remaining === 1 ? "" : "s"} remaining`
            : "All required items complete"}
        </p>
      </div>
      {next ? (
        <Button onClick={() => onContinue(next.id)}>Continue Editing</Button>
      ) : null}
    </div>
  );
}
