"use client";

import { CheckCircle2, Eye, Lightbulb, type LucideIcon } from "lucide-react";
import type { Method } from "@dse-pms/shared-types";
import { Progress } from "@dse-pms/ui";
import type { WeekForm } from "../weekly-plan-model";
import { weekSltForm } from "../weekly-plan-model";
import { teachingResourceLabel, weekFormErrors } from "./week-form-fields";

const STEP_TIPS: Record<number, string[]> = {
  1: ["Choose the CLOs this week contributes to.", "Teaching and assessment suggestions come from the linked CLOs."],
  2: ["Write lesson-level outcomes students should achieve by the end of this week.", "Keep each LLO observable and specific to the lesson."],
  3: ["Teaching Methods describe how learning is facilitated.", "Student Activities describe what students actually do."],
  4: ["Include contact and independent learning time in SLT.", "Choose only assessment methods actually used this week.", "Select the teaching resources you plan to use; links are managed later in Resources."],
  5: ["Review the full alignment before saving.", "Go back to any step if something needs adjustment."],
};

export function WeekWizardSidebar({ draft, step, teachingMethods, assessmentMethods, lloRequired }: {
  draft: WeekForm; step: number; teachingMethods: Method[]; assessmentMethods: Method[]; lloRequired: boolean;
}) {
  const errors = weekFormErrors(draft, lloRequired);
  const stepDone = [
    Boolean(draft.topic.trim() && draft.cloCodes.length),
    !errors.llos,
    Boolean(draft.teachingMethodIds.length && (draft.studentLearningActivities.length || draft.activities.length)),
    Boolean(weekSltForm(draft) > 0 && draft.assessmentMethodIds.length),
    !errors.topic && !errors.clos && !errors.llos && !errors.activities && draft.teachingMethodIds.length > 0 && weekSltForm(draft) > 0 && draft.assessmentMethodIds.length > 0,
  ];
  const doneCount = stepDone.filter(Boolean).length;
  const percent = Math.round((doneCount / stepDone.length) * 100);
  const teachingNames = teachingMethods.filter((m) => draft.teachingMethodIds.includes(m.id)).map((m) => m.name);
  const assessmentNames = assessmentMethods.filter((m) => draft.assessmentMethodIds.includes(m.id)).map((m) => m.name);

  return <div className="space-y-5">
    <SidebarCard title="Live Preview" icon={Eye} tone="blue">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex rounded-md bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">Week {draft.week || "—"}</span>
        <span className="text-xs text-muted-foreground">Draft</span>
      </div>
      <p className="mt-2 text-sm font-medium text-foreground">{draft.topic.trim() || <span className="font-normal text-muted-foreground">No topic yet…</span>}</p>
      <PreviewLine label="CLOs" value={draft.cloCodes.join(" · ") || "Not linked yet"} />
      <PreviewLine label="LLOs" value={draft.lessonLearningOutcomes.length ? `${draft.lessonLearningOutcomes.length} defined` : "Not added yet"} />
      <PreviewLine label="Teaching" value={teachingNames.join(", ") || "Not selected yet"} />
      <PreviewLine label="Activities" value={draft.studentLearningActivities.length ? `${draft.studentLearningActivities.length} defined` : "Not added yet"} />
      <PreviewLine label="SLT" value={`${weekSltForm(draft)} hours`} />
      <PreviewLine label="Assessment" value={assessmentNames.join(", ") || "Not selected yet"} />
      <PreviewLine label="Resources" value={draft.teachingResourceTypes.map(teachingResourceLabel).join(", ") || "None selected"} />
    </SidebarCard>

    <SidebarCard title="Progress">
      <Progress value={percent}>
        <div className="flex w-full items-center justify-between text-xs text-muted-foreground"><span>{doneCount} of 5 steps complete</span><span>{percent}%</span></div>
      </Progress>
      <ul className="mt-3 space-y-1.5 text-xs">{["Week & Outcomes", "Lesson Outcomes", "Teaching & Learning", "Time, Assessment & Resources", "Review"].map((label, i) => <li key={label} className="flex items-center gap-1.5"><CheckCircle2 className={`h-3.5 w-3.5 ${stepDone[i] ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/40"}`} /><span className={stepDone[i] ? "text-foreground" : "text-muted-foreground"}>{label}</span></li>)}</ul>
    </SidebarCard>

    <SidebarCard title="Quick Tips" icon={Lightbulb} tone="emerald">
      <ul className="space-y-1.5 text-xs text-foreground">{(STEP_TIPS[step] ?? []).map((tip) => <li key={tip} className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />{tip}</li>)}</ul>
    </SidebarCard>
  </div>;
}

function PreviewLine({ label, value }: { label: string; value: string }) { return <div className="mt-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-xs text-foreground">{value}</p></div>; }

const TONE_CARD = { blue: "border-blue-200/70 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20", emerald: "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20" } as const;
const TONE_ICON = { blue: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300", emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" } as const;
function SidebarCard({ title, icon: Icon, tone, children }: { title: string; icon?: LucideIcon; tone?: keyof typeof TONE_CARD; children: React.ReactNode }) { return <div className={`rounded-lg border p-3 ${tone ? TONE_CARD[tone] : "border-border bg-muted/30"}`}><h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{Icon ? <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${tone ? TONE_ICON[tone] : "bg-muted text-muted-foreground"}`}><Icon className="h-3 w-3" /></span> : null}{title}</h4>{children}</div>; }
