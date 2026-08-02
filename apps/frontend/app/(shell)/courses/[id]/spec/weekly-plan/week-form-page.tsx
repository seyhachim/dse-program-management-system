"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
} from "@dse-pms/ui";
import { Topbar } from "../../../../topbar";
import { ApiError } from "@/lib/api";
import { coursesApi, type CourseView } from "@/lib/courses";
import { courseSpecApi } from "@/lib/course-spec";
import { toClosForm, type CloForm } from "../clos-section";
import {
  emptyWeek,
  toWeeklyPlanForm,
  toWeeklyPlanPayload,
  type WeekForm,
  type WeeklyPlanForm,
} from "../weekly-plan-model";
import { WeekFormFields, weekFormErrors } from "./week-form-fields";

export function WeekFormPage({ courseId, weekId }: { courseId: string; weekId: string | null }) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [clos, setClos] = useState<CloForm[]>([]);
  const [weeks, setWeeks] = useState<WeeklyPlanForm>([]);
  const [draft, setDraft] = useState<WeekForm | null>(null);
  const [lloRequired, setLloRequired] = useState(true);
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
        const [spec, courseView] = await Promise.all([courseSpecApi.get(courseId), coursesApi.get(courseId)]);
        if (cancelled) return;
        const weeklyForm = toWeeklyPlanForm(spec.data.slt);
        setClos(toClosForm(spec.data.clos));
        setWeeks(weeklyForm);
        setCourse(courseView);
        if (weekId) {
          const existing = weeklyForm.find((w) => w.id === weekId) ?? null;
          setDraft(existing);
          setNotFound(!existing);
          // A legacy week that already existed with zero LLOs stays optional; one that
          // already has LLOs (or is brand new) keeps the field required going forward.
          setLloRequired(!existing || existing.lloItems.length > 0);
        } else {
          setDraft(emptyWeek(weeklyForm));
          setLloRequired(true);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load the weekly plan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, weekId]);

  const existingAssessments = useMemo(
    () => [...new Set(weeks.map((w) => w.assessment.trim()).filter(Boolean))],
    [weeks],
  );

  const set = (patch: Partial<WeekForm>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const toggleClo = (code: string) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            cloCodes: d.cloCodes.includes(code) ? d.cloCodes.filter((c) => c !== code) : [...d.cloCodes, code],
          }
        : d,
    );

  const backHref = `/courses/${courseId}/spec?tab=slt`;

  const submit = async () => {
    if (!draft) return;
    setTouched(true);
    const errors = weekFormErrors(draft, lloRequired);
    if (errors.topic || errors.clos || errors.llos || errors.activities) return;

    setSaving(true);
    setError(null);
    try {
      const exists = weeks.some((w) => w.id === draft.id);
      const next = exists ? weeks.map((w) => (w.id === draft.id ? draft : w)) : [...weeks, draft];
      next.sort((a, b) => (Number(a.week) || 0) - (Number(b.week) || 0));
      await courseSpecApi.saveSection(courseId, "slt", toWeeklyPlanPayload(next));
      router.push(backHref);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save this week");
    } finally {
      setSaving(false);
    }
  };

  const breadcrumbLabel = course ? `${course.code} – ${course.title}` : "Course Specification";
  const pageTitle = weekId ? `Edit Week ${draft?.week ?? ""}` : "Add Week";

  return (
    <>
      <Topbar
        title={pageTitle}
        subtitle="Plan the topic, linked CLOs, learning activities and time allocation for this week."
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-4">
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
                <BreadcrumbLink render={<Link href={backHref}>Weekly Plan</Link>} />
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
              That week could not be found. <Link href={backHref} className="underline">Back to Weekly Plan</Link>
            </p>
          ) : draft ? (
            <div className="space-y-6 rounded-xl border border-border bg-card p-6">
              <WeekFormFields
                draft={draft}
                set={set}
                toggleClo={toggleClo}
                clos={clos}
                touched={touched}
                existingAssessments={existingAssessments}
                lloRequired={lloRequired}
              />

              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button variant="outline" render={<Link href={backHref}>Cancel</Link>} />
                <Button onClick={submit} disabled={saving}>
                  {saving ? "Saving…" : "Save Week"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
