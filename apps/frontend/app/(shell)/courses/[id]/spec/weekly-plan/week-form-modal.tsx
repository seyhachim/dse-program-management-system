"use client";
import type { Method } from "@dse-pms/shared-types";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@dse-pms/ui";
import type { CloForm } from "../clos-section";
import { emptyWeek, weekSltForm, type WeekForm, type WeeklyPlanForm } from "../weekly-plan-model";
import { WeekFormFields, teachingResourceLabel, weekFormErrors } from "./week-form-fields";
import { clearWeekDraft, loadWeekDraft, saveWeekDraft } from "./week-draft-storage";
import { WeekSuggestionsPanel } from "./week-suggestions-panel";
import { WeekWizardSidebar } from "./week-wizard-sidebar";

const STEPS = [
  { id: 1, title: "Week & Outcomes", sections: [1, 2] },
  { id: 2, title: "Lesson Outcomes", sections: [3] },
  { id: 3, title: "Teaching & Learning", sections: [4, 5] },
  { id: 4, title: "Time, Assessment & Resources", sections: [6, 7, 8] },
  { id: 5, title: "Review", sections: [] },
] as const;

export function WeekFormModal({ open, onOpenChange, courseId, weekId, weeks, clos, teachingMethods, assessmentMethods, onSave }: {
  open: boolean; onOpenChange: (open: boolean) => void; courseId: string; weekId: string | null; weeks: WeeklyPlanForm; clos: CloForm[]; teachingMethods: Method[]; assessmentMethods: Method[]; onSave: (next: WeeklyPlanForm) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<WeekForm | null>(null);
  const [lloRequired, setLloRequired] = useState(true);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!open) return;
    const existing = weekId ? (weeks.find((w) => w.id === weekId) ?? null) : null;
    const localDraft = loadWeekDraft(courseId, weekId);
    setDraft(localDraft ?? existing ?? emptyWeek(weeks));
    setLloRequired(!existing || existing.lloItems.length > 0);
    setTouched(false); setStep(1); setDraftSavedAt(localDraft ? new Date() : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekId, courseId]);

  const set = (patch: Partial<WeekForm>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggleClo = (code: string) => setDraft((d) => {
    if (!d) return d;
    const nextCloCodes = d.cloCodes.includes(code) ? d.cloCodes.filter((c) => c !== code) : [...d.cloCodes, code];
    const allowedTeachingMethodIds = new Set(clos.filter((clo) => nextCloCodes.includes(clo.code)).flatMap((clo) => clo.teachingMethodIds));
    const allowedAssessmentMethodIds = new Set(clos.filter((clo) => nextCloCodes.includes(clo.code)).flatMap((clo) => clo.assessmentMethodIds));
    return { ...d, cloCodes: nextCloCodes, teachingMethodIds: d.teachingMethodIds.filter((id) => allowedTeachingMethodIds.has(id)), assessmentMethodIds: d.assessmentMethodIds.filter((id) => allowedAssessmentMethodIds.has(id)) };
  });
  const existingAssessments = useMemo(() => [...new Set(weeks.map((w) => w.assessment.trim()).filter(Boolean))], [weeks]);

  const saveDraftNow = () => { if (!draft) return; saveWeekDraft(courseId, weekId, draft); setDraftSavedAt(new Date()); };
  const goToStep = (next: number) => { if (!draft) return; saveWeekDraft(courseId, weekId, draft); setDraftSavedAt(new Date()); setStep(next); };

  const goNext = () => {
    if (!draft) return;
    const errors = weekFormErrors(draft, lloRequired);
    if (step === 1 && (errors.topic || errors.clos)) { setTouched(true); return; }
    if (step === 2 && errors.llos) { setTouched(true); return; }
    if (step === 3 && errors.activities) { setTouched(true); return; }
    goToStep(Math.min(5, step + 1));
  };

  const submit = async () => {
    if (!draft) return;
    const errors = weekFormErrors(draft, lloRequired);
    if (errors.topic || errors.clos || errors.llos || errors.activities) { setTouched(true); setStep(errors.topic || errors.clos ? 1 : errors.llos ? 2 : 3); return; }
    const exists = weeks.some((w) => w.id === draft.id);
    const next = exists ? weeks.map((w) => (w.id === draft.id ? draft : w)) : [...weeks, draft];
    next.sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0));
    setSaving(true);
    try { const saved = await onSave(next); if (saved) { clearWeekDraft(courseId, weekId); onOpenChange(false); } } finally { setSaving(false); }
  };

  const title = weekId ? `Edit Week ${draft?.week ?? ""}` : "Add Weekly Plan";
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1200px]">
      <DialogHeader><DialogTitle className="text-lg font-bold">{title}</DialogTitle></DialogHeader>
      {draft ? <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-3"><ol className="flex items-center gap-1 overflow-x-auto">{STEPS.map((s, index) => <li key={s.id} className="flex items-center"><button type="button" aria-current={s.id === step ? "step" : undefined} onClick={() => goToStep(s.id)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${s.id === step ? "bg-accent text-accent-foreground" : s.id < step ? "text-foreground hover:bg-muted" : "text-muted-foreground hover:bg-muted"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${s.id === step ? "border-accent-foreground" : "border-current"}`}>{s.id}</span>{s.title}</button>{index < STEPS.length - 1 ? <span aria-hidden className="mx-1 h-px w-4 bg-border" /> : null}</li>)}</ol></div>
        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">{step < 5 ? <WeekFormFields draft={draft} set={set} toggleClo={toggleClo} clos={clos} teachingMethods={teachingMethods} assessmentMethods={assessmentMethods} touched={touched} existingAssessments={existingAssessments} lloRequired={lloRequired} visibleSections={[...(STEPS[step - 1]?.sections ?? [])]} /> : <WeekReview draft={draft} teachingMethods={teachingMethods} assessmentMethods={assessmentMethods} />}</div>
          <div className="space-y-4 lg:border-l lg:border-border lg:pl-6">
            <WeekSuggestionsPanel courseId={courseId} draft={draft} set={set} clos={clos} teachingMethods={teachingMethods} />
            <WeekWizardSidebar draft={draft} step={step} teachingMethods={teachingMethods} assessmentMethods={assessmentMethods} lloRequired={lloRequired} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
          <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={saveDraftNow} className="bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60">Save Draft</Button>{draftSavedAt ? <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="h-3.5 w-3.5" />Draft saved on this device</span> : null}</div>
          <div className="flex items-center gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>{step > 1 ? <Button variant="outline" onClick={() => goToStep(step - 1)}>Previous</Button> : null}{step < 5 ? <Button onClick={goNext}>Next</Button> : <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Week"}</Button>}</div>
        </div>
      </div> : null}
    </DialogContent>
  </Dialog>;
}

function WeekReview({ draft, teachingMethods, assessmentMethods }: { draft: WeekForm; teachingMethods: Method[]; assessmentMethods: Method[] }) {
  const teaching = teachingMethods.filter((m) => draft.teachingMethodIds.includes(m.id)).map((m) => m.name);
  const assessments = assessmentMethods.filter((m) => draft.assessmentMethodIds.includes(m.id)).map((m) => m.name);
  return <div className="space-y-5"><div><h3 className="text-base font-semibold text-foreground">Review Week {draft.week}</h3><p className="text-sm text-muted-foreground">Review the constructive alignment before saving this week.</p></div><div className="grid gap-3 sm:grid-cols-2">
    <ReviewCard label="Topic" value={draft.topic || "—"} /><ReviewCard label="CLOs" value={draft.cloCodes.join(" · ") || "—"} />
    <ReviewCard label="Lesson Learning Outcomes" value={draft.lessonLearningOutcomes.map((x) => x.description).filter(Boolean).join(" • ") || "—"} />
    <ReviewCard label="Teaching Methods" value={teaching.join(" • ") || "—"} />
    <ReviewCard label="Student Activities" value={draft.studentLearningActivities.map((x) => x.title).join(" • ") || draft.activities.join(" • ") || "—"} />
    <ReviewCard label="Time Allocation" value={`L ${draft.lectureHours || 0}h · T ${draft.tutorialHours || 0}h · P ${draft.practiceHours || 0}h · O ${draft.otherHours || 0}h · NF2F ${draft.selfStudyHours || 0}h · SLT ${weekSltForm(draft)}h`} />
    <ReviewCard label="Assessment" value={assessments.join(" • ") || draft.assessment || "—"} />
    <ReviewCard label="Teaching Resources" value={draft.teachingResourceTypes.map(teachingResourceLabel).join(" • ") || "None selected"} />
  </div></div>;
}
function ReviewCard({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border border-border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm text-foreground">{value}</p></div>; }
