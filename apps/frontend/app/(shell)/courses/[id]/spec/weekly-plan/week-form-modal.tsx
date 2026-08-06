"use client";
import type { Method } from "@dse-pms/shared-types";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@dse-pms/ui";
import type { CloForm } from "../clos-section";
import {
  emptyWeek,
  type WeekForm,
  type WeeklyPlanForm,
} from "../weekly-plan-model";
import { WeekFormFields, weekFormErrors } from "./week-form-fields";

/**
 * Popup modal for adding/editing a §18 week. Mirrors `CloWizardModal`'s popup
 * pattern (issue #100) instead of the routed /weekly-plan/add and
 * /weekly-plan/:id/edit full pages this replaces. Unlike CLOs, saving here
 * only updates the in-memory plan via `onSave` — persistence to the backend
 * stays on the Weekly Plan tab's own Save button, same as it already is for
 * deleting a week.
 */
export function WeekFormModal({
  open,
  onOpenChange,
  weekId,
  weeks,
  clos,
  assessmentMethods,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekId: string | null;
  weeks: WeeklyPlanForm;
  clos: CloForm[];
  assessmentMethods: Method[];
  onSave: (next: WeeklyPlanForm) => void;
}) {
  const [draft, setDraft] = useState<WeekForm | null>(null);
  const [lloRequired, setLloRequired] = useState(true);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    const existing = weekId
      ? (weeks.find((w) => w.id === weekId) ?? null)
      : null;
    setDraft(existing ?? emptyWeek(weeks));
    // A legacy week that already existed with zero LLOs stays optional; one that
    // already has LLOs (or is brand new) keeps the field required going forward.
    setLloRequired(!existing || existing.lloItems.length > 0);
    setTouched(false);
    // Only re-seed when the dialog is opened for a given week, not on every
    // `weeks` change (which would clobber an in-progress edit with stale props).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, weekId]);

  const set = (patch: Partial<WeekForm>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggleClo = (code: string) =>
    setDraft((d) => {
      if (!d) return d;

      const nextCloCodes = d.cloCodes.includes(code)
        ? d.cloCodes.filter((c) => c !== code)
        : [...d.cloCodes, code];

      // Assessment methods allowed by the CLOs that remain linked.
      const allowedAssessmentMethodIds = new Set(
        clos
          .filter((clo) => nextCloCodes.includes(clo.code))
          .flatMap((clo) => clo.assessmentMethodIds),
      );

      // Preserve only selections still supported by at least one linked CLO.
      const nextAssessmentMethodIds = d.assessmentMethodIds.filter((id) =>
        allowedAssessmentMethodIds.has(id),
      );

      return {
        ...d,
        cloCodes: nextCloCodes,
        assessmentMethodIds: nextAssessmentMethodIds,
      };
    });

  const existingAssessments = useMemo(
    () => [...new Set(weeks.map((w) => w.assessment.trim()).filter(Boolean))],
    [weeks],
  );

  const submit = () => {
    if (!draft) return;
    const errors = weekFormErrors(draft, lloRequired);
    if (errors.topic || errors.clos || errors.llos || errors.activities) {
      setTouched(true);
      return;
    }
    const exists = weeks.some((w) => w.id === draft.id);
    const next = exists
      ? weeks.map((w) => (w.id === draft.id ? draft : w))
      : [...weeks, draft];
    next.sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0));
    onSave(next);
    onOpenChange(false);
  };

  const title = weekId ? `Edit Week ${draft?.week ?? ""}` : "Add Weekly Plan";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
        </DialogHeader>

        {draft ? (
          <div className="space-y-6">
            <WeekFormFields
              draft={draft}
              set={set}
              toggleClo={toggleClo}
              clos={clos}
              assessmentMethods={assessmentMethods}
              touched={touched}
              existingAssessments={existingAssessments}
              lloRequired={lloRequired}
            />

            <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit}>Save Week</Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
