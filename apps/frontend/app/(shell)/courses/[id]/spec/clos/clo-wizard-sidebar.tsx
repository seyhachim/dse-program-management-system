"use client";

import { Progress } from "@dse-pms/ui";
import { CAP_LEVELS } from "@dse-pms/shared-types";
import {
  appendBloomVerb,
  bloomVerbsFor,
  CLO_WIZARD_STEPS,
  wizardStepComplete,
  type CloForm,
  type WizardStepId,
} from "../clo-model";

const QUICK_TIPS = [
  "Use measurable action verbs.",
  "Focus on one learning outcome.",
  "Align with at least one PLO.",
  "Keep 5–7 CLOs per course.",
];

/**
 * Right-hand rail shown alongside every wizard step: live preview, progress,
 * quick tips, and a Bloom's Taxonomy verb helper (issue #94).
 */
export function CloWizardSidebar({
  draft,
  code,
  onInsertVerb,
}: {
  draft: CloForm;
  code: string;
  onInsertVerb: (verb: string) => void;
}) {
  const doneCount = CLO_WIZARD_STEPS.filter((s) => s.id !== 5 && wizardStepComplete(s.id as WizardStepId, draft)).length;
  const totalSteps = CLO_WIZARD_STEPS.length - 1;
  const percent = Math.round((doneCount / totalSteps) * 100);
  const levelName = CAP_LEVELS.find((l) => l.code === draft.level)?.name;

  return (
    <div className="space-y-5">
      <SidebarCard title="Live Preview">
        <p className="text-sm font-semibold text-accent-foreground">{code || "New CLO"}</p>
        <p className="mt-1 text-sm text-foreground">
          {draft.description.trim() || <span className="text-muted-foreground">No statement yet…</span>}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {draft.level ? `${draft.level} — ${levelName}` : "No Bloom's level yet"} ·{" "}
          {draft.status === "active" ? "Active" : "Inactive"}
        </p>
      </SidebarCard>

      <SidebarCard title="Progress">
        <Progress value={percent}>
          <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
            <span>
              {doneCount} of {totalSteps} steps complete
            </span>
            <span>{percent}%</span>
          </div>
        </Progress>
      </SidebarCard>

      <SidebarCard title="Quick Tips">
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {QUICK_TIPS.map((tip) => (
            <li key={tip} className="flex gap-1.5">
              <span aria-hidden>•</span>
              {tip}
            </li>
          ))}
        </ul>
      </SidebarCard>

      <SidebarCard title="Bloom's Taxonomy Helper">
        <p className="mb-2 text-xs text-muted-foreground">Click a verb to add it to the statement.</p>
        <ul className="flex flex-wrap gap-1.5">
          {bloomVerbsFor(draft.level).map((verb) => (
            <li key={verb}>
              <button
                type="button"
                onClick={() => onInsertVerb(appendBloomVerb(draft.description, verb))}
                className="cursor-pointer rounded-full border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:border-accent-foreground hover:bg-accent/15 hover:text-accent-foreground"
              >
                {verb}
              </button>
            </li>
          ))}
        </ul>
      </SidebarCard>
    </div>
  );
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}
