"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button, Dialog, DialogContent } from "@dse-pms/ui";
import type { Method } from "@dse-pms/shared-types";
import {
  CLO_WIZARD_STEPS,
  cloWizardErrors,
  emptyClo,
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

/**
 * Multi-step wizard modal for adding/editing a §14 CLO (issue #94) — replaces
 * the old single long-scroll form. Same field set and save contract as before.
 * The caller (`ClosSection`) owns the CLO list and does the merge-by-code on
 * save, so this component only ever handles one CLO — remount it (`key` on the
 * caller's side) per open so draft/step state always starts fresh.
 */
export function CloWizardModal({
  open,
  onOpenChange,
  editing,
  nextCode,
  teachingMethods,
  assessmentMethods,
  courseTotalSlt,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The CLO being edited, or null to add a new one. */
  editing: CloForm | null;
  /** The code a new CLO would be assigned (preview only — the real position is decided on save). */
  nextCode: string;
  teachingMethods: Method[];
  assessmentMethods: Method[];
  courseTotalSlt: number | null;
  onSave: (draft: CloForm) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] w-full flex-col gap-0 p-0 text-sm sm:max-w-[1200px]"
      >
        {open ? (
          <CloWizardBody
            editing={editing}
            nextCode={nextCode}
            teachingMethods={teachingMethods}
            assessmentMethods={assessmentMethods}
            courseTotalSlt={courseTotalSlt}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function CloWizardBody({
  editing,
  nextCode,
  teachingMethods,
  assessmentMethods,
  courseTotalSlt,
  onSave,
  onClose,
}: {
  editing: CloForm | null;
  nextCode: string;
  teachingMethods: Method[];
  assessmentMethods: Method[];
  courseTotalSlt: number | null;
  onSave: (draft: CloForm) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CloForm>(() => (editing ? { ...editing } : emptyClo()));
  const [step, setStep] = useState<WizardStepId>(1);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const code = editing?.code ?? nextCode;
  const errors = cloWizardErrors(draft);

  const set = (patch: Partial<CloForm>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleMappedPlo = (id: string) =>
    setDraft((d) => {
      const has = d.mappedPlos.includes(id);
      return { ...d, mappedPlos: has ? d.mappedPlos.filter((x) => x !== id) : [...d.mappedPlos, id] };
    });

  const goNext = () => {
    if (step === 1 && errors.statement) {
      setTouched(true);
      return;
    }
    setStep((s) => (s < 5 ? ((s + 1) as WizardStepId) : s));
  };
  const goPrev = () => setStep((s) => (s > 1 ? ((s - 1) as WizardStepId) : s));

  const handleSave = async () => {
    if (errors.statement) {
      setTouched(true);
      setStep(1);
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) onClose();
    else setError("Failed to save this CLO. Please try again.");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{editing ? `Edit ${editing.code}` : "Add CLO"}</h2>
          <p className="text-xs text-muted-foreground">
            Define the outcome statement, mapped PLOs, methods and Bloom&apos;s level for this CLO.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

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
                  onClick={() => setStep(s.id)}
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
                {i < CLO_WIZARD_STEPS.length - 1 ? <span aria-hidden className="mx-1 h-px w-4 bg-border" /> : null}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-5 py-4 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          {step === 1 ? <CloStepInfo draft={draft} code={code} set={set} touched={touched} /> : null}
          {step === 2 ? <CloStepPlos draft={draft} toggle={toggleMappedPlo} /> : null}
          {step === 3 ? (
            <CloStepLearning draft={draft} set={set} teachingMethods={teachingMethods} courseTotalSlt={courseTotalSlt} />
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

      <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
        <span className="text-xs text-status-live">{error}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose}>
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save CLO"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
