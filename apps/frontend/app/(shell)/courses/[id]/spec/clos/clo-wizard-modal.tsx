"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@dse-pms/ui";
import {
  CLO_WIZARD_STEPS,
  cloWizardErrors,
  emptyClo,
  withCodes,
  type CloForm,
  type WizardStepId,
} from "../clo-model";
import { CloStepInfo, CloStepPlos, CloStepReview } from "./clo-wizard-steps";
import { CloWizardSidebar } from "./clo-wizard-sidebar";
import { clearCloDraft, loadCloDraft, saveCloDraft } from "./clo-draft-storage";

/**
 * Popup modal for adding/editing a §14 CLO.
 *
 * Step 2A responsibility:
 * 1. CLO statement + Bloom's Taxonomy
 * 2. PLO alignment
 * 3. Review
 *
 * Teaching methods are edited from the Teaching & Learning tab.
 * Existing teachingMethodIds / assessmentMethodIds remain part of CloForm
 * and are preserved when the CLO is saved.
 */
export function CloWizardModal({
  open,
  onOpenChange,
  courseId,
  cloCode,
  clos,
  onPersist,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;

  /** null = adding a new CLO; otherwise the code of the CLO being edited. */
  cloCode: string | null;

  clos: CloForm[];
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

    const base = cloCode
      ? (clos.find((clo) => clo.code === cloCode) ?? emptyClo())
      : emptyClo();

    const stored = loadCloDraft(courseId, cloCode);

    setDraft(stored ?? base);
    setStep(1);
    setTouched(false);
    setError(null);
    setDraftSavedAt(null);

    // Only re-seed when the dialog is opened for a given CLO.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cloCode, courseId]);

  const set = (patch: Partial<CloForm>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            ...patch,
          }
        : current,
    );
  };

  const toggleMappedPlo = (id: string) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const selected = current.mappedPlos.includes(id);

      return {
        ...current,
        mappedPlos: selected
          ? current.mappedPlos.filter((ploId) => ploId !== id)
          : [...current.mappedPlos, id],
      };
    });
  };

  const code = cloCode ?? `CLO${clos.length + 1}`;

  const errors = draft
    ? cloWizardErrors(draft)
    : {
        statement: true,
      };

  const persistDraft = () => {
    if (!draft) {
      return;
    }

    saveCloDraft(courseId, cloCode, draft);
  };

  const saveDraftNow = () => {
    if (!draft) {
      return;
    }

    saveCloDraft(courseId, cloCode, draft);
    setDraftSavedAt(Date.now());
  };

  useEffect(() => {
    if (!draftSavedAt) {
      return;
    }

    const timer = setTimeout(() => {
      setDraftSavedAt(null);
    }, 3000);

    return () => clearTimeout(timer);
  }, [draftSavedAt]);

  const goNext = () => {
    if (step === 1 && errors.statement) {
      setTouched(true);
      return;
    }

    persistDraft();

    setStep((current) =>
      current < 3 ? ((current + 1) as WizardStepId) : current,
    );
  };

  const goPrev = () => {
    persistDraft();

    setStep((current) =>
      current > 1 ? ((current - 1) as WizardStepId) : current,
    );
  };

  const goToStep = (id: WizardStepId) => {
    persistDraft();
    setStep(id);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      persistDraft();
    }

    onOpenChange(next);
  };

  const submit = async () => {
    if (!draft) {
      return;
    }

    if (errors.statement) {
      setTouched(true);
      setStep(1);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      /*
       * IMPORTANT:
       * `draft` still contains teachingMethodIds and assessmentMethodIds.
       *
       * Editing the CLO statement, Bloom level, or PLO mappings therefore
       * does not intentionally remove those existing relationships.
       */
      const next = cloCode
        ? clos.map((clo) => (clo.code === cloCode ? draft : clo))
        : [...clos, draft];

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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1200px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
            {error}
          </div>
        ) : null}

        {draft ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {/* ------------------------------------------------ Wizard header */}

            <div className="border-b border-border px-5 py-3">
              <ol className="flex items-center gap-1 overflow-x-auto">
                {CLO_WIZARD_STEPS.map((wizardStep, index) => {
                  const isActive = wizardStep.id === step;
                  const isPast = wizardStep.id < step;

                  return (
                    <li key={wizardStep.id} className="flex items-center">
                      <button
                        type="button"
                        aria-current={isActive ? "step" : undefined}
                        onClick={() => goToStep(wizardStep.id)}
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
                            isActive
                              ? "border-accent-foreground"
                              : "border-current"
                          }`}
                        >
                          {wizardStep.id}
                        </span>

                        {wizardStep.title}
                      </button>

                      {index < CLO_WIZARD_STEPS.length - 1 ? (
                        <span aria-hidden className="mx-1 h-px w-4 bg-border" />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* ------------------------------------------------ Wizard body */}

            <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[1fr_280px]">
              <div className="min-w-0">
                {step === 1 ? (
                  <CloStepInfo
                    draft={draft}
                    code={code}
                    set={set}
                    touched={touched}
                  />
                ) : null}

                {step === 2 ? (
                  <CloStepPlos draft={draft} toggle={toggleMappedPlo} />
                ) : null}

                {step === 3 ? (
                  <CloStepReview
                    draft={draft}
                    code={code}
                    onJump={(targetStep) => setStep(targetStep)}
                  />
                ) : null}
              </div>

              <div className="lg:border-l lg:border-border lg:pl-6">
                <CloWizardSidebar
                  draft={draft}
                  code={code}
                  onInsertVerb={(next) =>
                    set({
                      description: next,
                    })
                  }
                />
              </div>
            </div>

            {/* ------------------------------------------------ Wizard footer */}

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
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>

                {step > 1 ? (
                  <Button variant="outline" onClick={goPrev}>
                    Previous
                  </Button>
                ) : null}

                {step < 3 ? (
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
