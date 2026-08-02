"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@dse-pms/ui";
import type { Method } from "@dse-pms/shared-types";
import {
  CLO_WIZARD_STEPS,
  cloWizardErrors,
  emptyClo,
  withCodes,
  type CloForm,
  type WizardStepId,
} from "../clo-model";
import {
  CloStepAssessment,
  CloStepInfo,
  CloStepLearning,
  CloStepPlos,
  CloStepReview,
} from "./clo-wizard-steps";
import { CloWizardSidebar } from "./clo-wizard-sidebar";
import { clearCloDraft, loadCloDraft, saveCloDraft } from "./clo-draft-storage";

/**
 * Popup modal for adding/editing a §14 CLO. Replaces the routed
 * /clos/add and /clos/:code/edit full pages (issue #94's wizard, later
 * moved to a page for a shareable URL) with a Dialog again, per the
 * client's request — the shareable-URL benefit is intentionally traded
 * for the simpler popup UX.
 */
export function CloWizardModal({
  open,
  onOpenChange,
  courseId,
  cloCode,
  clos,
  teachingMethods,
  assessmentMethods,
  courseTotalSlt,
  onPersist,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  /** null = adding a new CLO; otherwise the code of the CLO being edited. */
  cloCode: string | null;
  clos: CloForm[];
  teachingMethods: Method[];
  assessmentMethods: Method[];
  courseTotalSlt: number | null;
  onPersist: (items: CloForm[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<CloForm | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [step, setStep] = useState<WizardStepId>(1);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const base = cloCode ? (clos.find((c) => c.code === cloCode) ?? emptyClo()) : emptyClo();
    const stored = loadCloDraft(courseId, cloCode);
    setDraft(stored ?? base);
    setStep(1);
    setTouched(false);
    setError(null);
    setDraftSavedAt(null);
    // Only re-seed when the dialog is opened for a given CLO, not on every
    // `clos` change (which would clobber in-progress edits with server state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cloCode, courseId]);

  const set = (patch: Partial<CloForm>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggleMappedPlo = (id: string) =>
    setDraft((d) => {
      if (!d) return d;
      const has = d.mappedPlos.includes(id);
      return { ...d, mappedPlos: has ? d.mappedPlos.filter((x) => x !== id) : [...d.mappedPlos, id] };
    });

  const code = cloCode ?? `CLO${clos.length + 1}`;
  const errors = draft ? cloWizardErrors(draft) : { statement: true };

  const persistDraft = () => {
    if (draft) saveCloDraft(courseId, cloCode, draft);
  };

  const saveDraftNow = () => {
    if (!draft) return;
    saveCloDraft(courseId, cloCode, draft);
    setDraftSavedAt(Date.now());
  };

  useEffect(() => {
    if (!draftSavedAt) return;
    const timer = setTimeout(() => setDraftSavedAt(null), 3000);
    return () => clearTimeout(timer);
  }, [draftSavedAt]);

  const goNext = () => {
    if (step === 1 && errors.statement) {
      setTouched(true);
      return;
    }
    persistDraft();
    setStep((s) => (s < 5 ? ((s + 1) as WizardStepId) : s));
  };
  const goPrev = () => {
    persistDraft();
    setStep((s) => (s > 1 ? ((s - 1) as WizardStepId) : s));
  };
  const goToStep = (id: WizardStepId) => {
    persistDraft();
    setStep(id);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) persistDraft();
    onOpenChange(next);
  };

  const submit = async () => {
    if (!draft) return;
    if (errors.statement) {
      setTouched(true);
      setStep(1);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const next = cloCode ? clos.map((c) => (c.code === cloCode ? draft : c)) : [...clos, draft];
      const ok = await onPersist(withCodes(next));
      if (!ok) {
        setError("Failed to save this CLO");
        return;
      }
      clearCloDraft(courseId, cloCode);
      onOpenChange(false);
    } catch {
      setError("Failed to save this CLO");
    } finally {
      setSaving(false);
    }
  };

  const title = cloCode ? `Edit ${cloCode}` : "Add CLO";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
            {error}
          </div>
        ) : null}

        {draft ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <ol className="flex items-center gap-1 overflow-x-auto">
                {CLO_WIZARD_STEPS.map((s, i) => {
                  const isActive = s.id === step;
                  const isPast = s.id < step;
                  return (
                    <li key={s.id} className="flex items-center">
                      <button
                        type="button"
                        aria-current={isActive ? "step" : undefined}
                        onClick={() => goToStep(s.id)}
                        className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : isPast
                              ? "text-foreground hover:bg-muted"
                              : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                            isActive ? "border-accent-foreground" : "border-current"
                          }`}
                        >
                          {s.id}
                        </span>
                        {s.title}
                      </button>
                      {i < CLO_WIZARD_STEPS.length - 1 ? (
                        <span aria-hidden className="mx-1 h-px w-4 bg-border" />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[1fr_280px]">
              <div className="min-w-0">
                {step === 1 ? <CloStepInfo draft={draft} code={code} set={set} touched={touched} /> : null}
                {step === 2 ? <CloStepPlos draft={draft} toggle={toggleMappedPlo} /> : null}
                {step === 3 ? (
                  <CloStepLearning
                    draft={draft}
                    set={set}
                    teachingMethods={teachingMethods}
                    courseTotalSlt={courseTotalSlt}
                  />
                ) : null}
                {step === 4 ? <CloStepAssessment draft={draft} set={set} assessmentMethods={assessmentMethods} /> : null}
                {step === 5 ? (
                  <CloStepReview
                    draft={draft}
                    code={code}
                    teachingMethods={teachingMethods}
                    assessmentMethods={assessmentMethods}
                    onJump={setStep}
                  />
                ) : null}
              </div>
              <div className="lg:border-l lg:border-border lg:pl-6">
                <CloWizardSidebar draft={draft} code={code} onInsertVerb={(next) => set({ description: next })} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={saveDraftNow}
                  className="bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-950/60"
                >
                  Save Draft
                </Button>
                {draftSavedAt ? (
                  <span
                    aria-live="polite"
                    className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Draft saved on this device
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                {step > 1 ? (
                  <Button variant="outline" onClick={goPrev}>
                    Previous
                  </Button>
                ) : null}
                {step < 5 ? (
                  <Button onClick={goNext}>Next</Button>
                ) : (
                  <Button onClick={submit} disabled={saving}>
                    {saving ? "Saving…" : "Save CLO"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
