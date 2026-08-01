"use client";

import { CheckCircle2, Eye, Lightbulb, type LucideIcon } from "lucide-react";
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
      <SidebarCard title="Live Preview" icon={Eye} tone="blue">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            {code || "New CLO"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: draft.status === "active" ? "#22c55e" : "var(--muted-foreground)" }}
            />
            {draft.status === "active" ? "Active" : "Inactive"}
          </span>
        </div>
        <p className="mt-2 text-sm text-foreground">
          {draft.description.trim() || <span className="text-muted-foreground">No statement yet…</span>}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {draft.level ? `${draft.level} — ${levelName}` : "No Bloom's level yet"}
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

      <SidebarCard title="Quick Tips" icon={Lightbulb} tone="emerald">
        <ul className="space-y-1.5 text-xs text-foreground">
          {QUICK_TIPS.map((tip) => (
            <li key={tip} className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
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
                className="cursor-pointer rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
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

const TONE_CARD: Record<"blue" | "emerald", string> = {
  blue: "border-blue-200/70 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20",
  emerald: "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20",
};

const TONE_ICON: Record<"blue" | "emerald", string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

function SidebarCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  tone?: "blue" | "emerald";
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone ? TONE_CARD[tone] : "border-border bg-muted/30"}`}>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {Icon ? (
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
              tone ? TONE_ICON[tone] : "bg-muted text-muted-foreground"
            }`}
          >
            <Icon className="h-3 w-3" />
          </span>
        ) : null}
        {title}
      </h4>
      {children}
    </div>
  );
}
