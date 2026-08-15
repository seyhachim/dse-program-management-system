"use client";

import { useEffect, useState } from "react";
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
import type { Rubric } from "@dse-pms/shared-types";
import { Topbar } from "../../../../topbar";
import { ApiError } from "@/lib/api";
import { coursesApi, type CourseView } from "@/lib/courses";
import { courseSpecApi } from "@/lib/course-spec";
import { rubricsApi } from "@/lib/rubrics";
import { toClosForm, type CloForm } from "../clo-model";
import {
  emptyAssessment,
  toAssessmentForm,
  toAssessmentPayload,
  type AssessmentForm,
} from "../assessment-model";
import {
  AssessmentFormFields,
  assessmentFormErrors,
} from "./assessment-form-fields";

function deriveMappedPlos(cloCodes: string[], clos: CloForm[]): string[] {
  const selected = new Set(cloCodes);
  const plos = new Set<string>();

  for (const clo of clos) {
    if (!selected.has(clo.code)) continue;
    for (const plo of clo.mappedPlos) plos.add(plo);
  }

  return [...plos].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
}

export function AssessmentFormPage({
  courseId,
  assessmentId,
}: {
  courseId: string;
  assessmentId: string | null;
}) {
  const router = useRouter();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [items, setItems] = useState<AssessmentForm[]>([]);
  const [clos, setClos] = useState<CloForm[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [draft, setDraft] = useState<AssessmentForm | null>(null);
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
        const [spec, courseView, rubricList] = await Promise.all([
          courseSpecApi.get(courseId),
          coursesApi.get(courseId),
          rubricsApi.list().catch(() => [] as Rubric[]),
        ]);
        if (cancelled) return;
        const list = toAssessmentForm(spec.data.assessmentPlan);
        const cloList = toClosForm(spec.data.clos);
        setItems(list);
        setClos(cloList);
        setCourse(courseView);
        setRubrics(rubricList);
        if (assessmentId) {
          const existing = list.find((assessment) => assessment.id === assessmentId) ?? null;
          if (!existing) {
            setDraft(null);
            setNotFound(true);
            return;
          }
          setDraft({
            ...existing,
            mappedPlos: deriveMappedPlos(existing.cloCodes, cloList),
          });
          setNotFound(false);
        } else {
          setDraft(emptyAssessment());
          setNotFound(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load the course specification",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, assessmentId]);

  const set = (patch: Partial<AssessmentForm>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  const toggleClo = (code: string) => {
    setDraft((current) => {
      if (!current) return current;
      const selected = current.cloCodes.includes(code);
      const cloCodes = selected
        ? current.cloCodes.filter((item) => item !== code)
        : [...current.cloCodes, code];
      return {
        ...current,
        cloCodes,
        mappedPlos: deriveMappedPlos(cloCodes, clos),
      };
    });
  };

  const backHref = `/courses/${courseId}/spec?tab=assessmentPlan`;

  const submit = async () => {
    if (!draft) return;
    setTouched(true);
    const formErrors = assessmentFormErrors(draft);
    if (formErrors.name || formErrors.weight) {
      if (formErrors.weight) {
        setError("Enter a course grade weight between 1 and 100, or mark this assessment as formative / non-graded.");
      }
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const normalizedDraft: AssessmentForm = {
        ...draft,
        mappedPlos: deriveMappedPlos(draft.cloCodes, clos),
      };
      const next = assessmentId
        ? items.map((assessment) =>
            assessment.id === assessmentId ? normalizedDraft : assessment,
          )
        : [...items, normalizedDraft];
      await courseSpecApi.saveSection(
        courseId,
        "assessmentPlan",
        toAssessmentPayload(next),
      );
      router.push(backHref);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to save this assessment",
      );
    } finally {
      setSaving(false);
    }
  };

  const breadcrumbLabel = course
    ? `${course.code} – ${course.title}`
    : "Course Specification";
  const pageTitle = assessmentId ? "Edit Assessment" : "Add Assessment";

  return (
    <>
      <Topbar
        title={pageTitle}
        subtitle="Define local course grading and explicit CLO evidence independently, then add marking, submission, and feedback information."
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
                <BreadcrumbLink render={<Link href={`/courses/${courseId}`}>{breadcrumbLabel}</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href={backHref}>Assessment</Link>} />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {error ? (
            <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-4 py-3 text-sm text-status-live">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">Loading assessment…</div>
          ) : notFound ? (
            <div className="rounded-xl border border-border bg-card p-8">
              <h2 className="font-semibold text-foreground">Assessment not found</h2>
              <p className="mt-1 text-sm text-muted-foreground">This assessment no longer exists in the course specification.</p>
              <Button className="mt-4" variant="outline" onClick={() => router.push(backHref)}>Back to Assessment</Button>
            </div>
          ) : draft ? (
            <>
              <AssessmentFormFields
                draft={draft}
                set={set}
                toggleClo={toggleClo}
                clos={clos}
                rubrics={rubrics}
                courseId={courseId}
                touched={touched}
              />
              <div className="sticky bottom-0 z-20 flex items-center justify-end gap-2 border-t border-border bg-background/95 py-4 backdrop-blur">
                <Button variant="outline" disabled={saving} onClick={() => router.push(backHref)}>Cancel</Button>
                <Button disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : "Save Assessment"}</Button>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}
