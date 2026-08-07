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

/**
 * Derive Assessment → PLO alignment from the selected CLOs.
 *
 * The lecturer owns:
 *   Assessment → CLO
 *
 * Programme/course alignment then gives us:
 *   Assessment → CLO → PLO
 *
 * We continue storing the derived PLO codes in AssessmentForm.mappedPlos
 * for compatibility with the existing CourseSpec document shape.
 */
function deriveMappedPlos(cloCodes: string[], clos: CloForm[]): string[] {
  const selected = new Set(cloCodes);
  const plos = new Set<string>();

  for (const clo of clos) {
    if (!selected.has(clo.code)) {
      continue;
    }

    for (const plo of clo.mappedPlos) {
      plos.add(plo);
    }
  }

  return [...plos].sort((a, b) =>
    a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
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
          const existing =
            list.find((assessment) => assessment.id === assessmentId) ?? null;

          if (!existing) {
            setDraft(null);
            setNotFound(true);
            return;
          }

          /*
           * Re-derive the PLO alignment from the current CLO mappings when
           * opening an existing assessment.
           *
           * This also corrects legacy/inconsistent manually-selected PLOs
           * without changing the database schema.
           */
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
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId, assessmentId]);

  const set = (patch: Partial<AssessmentForm>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  };

  /**
   * CLO selection is the only manually editable academic alignment
   * relationship on the assessment.
   *
   * Whenever CLOs change, mappedPlos is recalculated automatically.
   */
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

    if (assessmentFormErrors(draft).name) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      /*
       * Derive again at the persistence boundary.
       *
       * This prevents stale mappedPlos values from being written even if
       * some future UI change modifies cloCodes without using toggleClo().
       */
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
        subtitle="Define the assessment, link it to CLOs, set its weighting and plan its schedule."
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={<Link href="/courses">Course Management</Link>}
                />
              </BreadcrumbItem>

              <BreadcrumbSeparator />

              <BreadcrumbItem>
                <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
              </BreadcrumbItem>

              <BreadcrumbSeparator />

              <BreadcrumbItem>
                <BreadcrumbLink
                  render={<Link href={backHref}>Course Specification</Link>}
                />
              </BreadcrumbItem>

              <BreadcrumbSeparator />

              <BreadcrumbItem>
                <BreadcrumbLink
                  render={<Link href={backHref}>Assessment</Link>}
                />
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
              That assessment could not be found.{" "}
              <Link href={backHref} className="underline">
                Back to Assessment
              </Link>
            </p>
          ) : draft ? (
            <div className="space-y-6 rounded-xl border border-border bg-card p-6">
              <AssessmentFormFields
                draft={draft}
                set={set}
                toggleClo={toggleClo}
                clos={clos}
                rubrics={rubrics}
                courseId={courseId}
                touched={touched}
              />

              <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  render={<Link href={backHref}>Cancel</Link>}
                />

                <Button onClick={submit} disabled={saving}>
                  {saving ? "Saving…" : "Save Assessment"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
