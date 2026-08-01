"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
} from "@dse-pms/ui";
import type { Method } from "@dse-pms/shared-types";
import { Topbar } from "../../../../topbar";
import { ApiError } from "@/lib/api";
import { coursesApi, type CourseView } from "@/lib/courses";
import { courseSpecApi } from "@/lib/course-spec";
import { methodsApi } from "@/lib/methods";
import {
  CLO_WIZARD_STEPS,
  cloWizardErrors,
  emptyClo,
  toClosForm,
  toClosPayload,
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
 * Full-page multi-step wizard for adding/editing a §14 CLO (issue #94) —
 * routed at /clos/add and /clos/:code/edit like the form it replaced, with the
 * same breadcrumb, so the CLO editor keeps a shareable URL and browser
 * back/forward instead of living behind a modal.
 */
export function CloWizardPage({ courseId, cloCode }: { courseId: string; cloCode: string | null }) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [clos, setClos] = useState<CloForm[]>([]);
  const [teachingMethods, setTeachingMethods] = useState<Method[]>([]);
  const [assessmentMethods, setAssessmentMethods] = useState<Method[]>([]);
  const [draft, setDraft] = useState<CloForm | null>(null);
  const [baseDraft, setBaseDraft] = useState<CloForm | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [step, setStep] = useState<WizardStepId>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [spec, methods, courseView] = await Promise.all([
          courseSpecApi.get(courseId),
          methodsApi.list(),
          coursesApi.get(courseId),
        ]);
        if (cancelled) return;
        const closForm = toClosForm(spec.data.clos, spec.data.cloMapping);
        setClos(closForm);
        setTeachingMethods(methods.teaching);
        setAssessmentMethods(methods.assessment);
        setCourse(courseView);
        let base: CloForm | null;
        if (cloCode) {
          const existing = closForm.find((c) => c.code === cloCode) ?? null;
          base = existing;
          setNotFound(!existing);
        } else {
          base = emptyClo();
        }
        setBaseDraft(base);
        const stored = base ? loadCloDraft(courseId, cloCode) : null;
        if (stored) {
          setDraft(stored);
          setRestoredDraft(true);
        } else {
          setDraft(base);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load the course specification");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, cloCode]);

  const set = (patch: Partial<CloForm>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggleMappedPlo = (id: string) =>
    setDraft((d) => {
      if (!d) return d;
      const has = d.mappedPlos.includes(id);
      return { ...d, mappedPlos: has ? d.mappedPlos.filter((x) => x !== id) : [...d.mappedPlos, id] };
    });

  const backHref = `/courses/${courseId}/spec?tab=clos`;
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

  const discardDraft = () => {
    clearCloDraft(courseId, cloCode);
    setDraft(baseDraft);
    setRestoredDraft(false);
    setStep(1);
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
      await courseSpecApi.saveSection(courseId, "clos", toClosPayload(withCodes(next)));
      clearCloDraft(courseId, cloCode);
      router.push(backHref);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save this CLO");
    } finally {
      setSaving(false);
    }
  };

  const breadcrumbLabel = course ? `${course.code} – ${course.title}` : "Course Specification";
  const pageTitle = cloCode ? `Edit ${cloCode}` : "Add CLO";

  return (
    <>
      <Topbar
        title={pageTitle}
        subtitle="Define the outcome statement, mapped PLOs, methods and Bloom's level for this CLO."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/courses">Course Management</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={backHref}>Course Specification</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={backHref}>CLOs</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {error ? (
            <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
              {error}
            </div>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : notFound ? (
            <p className="text-sm text-muted-foreground">
              That CLO could not be found. <Link href={backHref} className="underline">Back to CLOs</Link>
            </p>
          ) : draft ? (
            <>
            {restoredDraft ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200/70 bg-blue-50/60 px-3 py-2 text-sm text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
                <span>Restored your unsaved changes from a previous session.</span>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="cursor-pointer whitespace-nowrap text-xs font-medium underline underline-offset-2 hover:no-underline"
                >
                  Discard and start over
                </button>
              </div>
            ) : null}
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
                      courseTotalSlt={course?.totalSltHours ?? null}
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
                  <Button variant="ghost" size="sm" onClick={saveDraftNow}>
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
                  <Button variant="outline" onClick={persistDraft} render={<Link href={backHref}>Cancel</Link>} />
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
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}
