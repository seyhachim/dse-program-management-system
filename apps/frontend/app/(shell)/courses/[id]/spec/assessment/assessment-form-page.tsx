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
        criterionCloMappings: current.criterionCloMappings
          .map((mapping) => ({
            ...mapping,
            cloCodes: mapping.cloCodes.filter((mapped) => cloCodes.includes(mapped)),
          }))
          .filter((mapping) => mapping.cloCodes.length > 0),
      };
    });
  };

  const backHref = `/courses/${courseId}/spec?tab=assessmentPlan`;

  const submit = async () => {
    if (!draft) return;

    setTouched(true);
    const validation = assessmentFormErrors(draft);
    if (Object.values(validation).some(Boolean)) return;

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
        err instanceof ApiError ? err.message : "Failed to save this assessment",
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
        subtitle="Create the assessment, map it to CLOs, and define marking, submission, and feedback information."
      />

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
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
                <BreadcrumbLink render={<Link href={backHref}>Assessment</Link>} />
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
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
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
                    nativeButton={false}
                    render={<Link href={backHref}>Cancel</Link>}
                  />
                  <Button onClick={submit} disabled={saving}>
                    {saving ? "Saving…" : "Save Assessment"}
                  </Button>
                </div>
              </div>
              <AssessmentSummary
                draft={draft}
                rubrics={rubrics}
                items={items}
                assessmentId={assessmentId}
              />
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}

function AssessmentSummary({
  draft,
  rubrics,
  items,
  assessmentId,
}: {
  draft: AssessmentForm;
  rubrics: Rubric[];
  items: AssessmentForm[];
  assessmentId: string | null;
}) {
  const rubric = rubrics.find((r) => r.id === draft.rubricId);
  const numberWeight = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const displayWeight = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);
  const otherAssessments = items.filter((item) => item.id !== assessmentId);
  const allocatedWeight = otherAssessments.reduce(
    (total, item) => total + numberWeight(item.weight),
    0,
  );
  const currentWeight = numberWeight(draft.weight);
  const remainingWeight = Math.max(0, 100 - allocatedWeight);
  const totalAfterSave = allocatedWeight + currentWeight;
  const checks = [
    ["Has assessment name", draft.name.trim() !== ""],
    ["Has weight (%)", draft.weight !== ""],
    ["Mapped to at least one CLO", draft.cloCodes.length > 0],
    ["Rubric selected", draft.rubricId !== ""],
    ["Feedback method selected", draft.feedbackMethod.trim() !== ""],
  ] as const;

  return (
    <aside className="space-y-4 xl:sticky xl:top-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-accent-foreground">
          Assessment Summary
        </h3>
        <dl className="mt-4 space-y-3 text-sm">
          <SummaryRow label="Name" value={draft.name || "—"} />
          <SummaryRow label="Type" value={draft.type || "—"} />
          <SummaryRow label="Weight" value={draft.weight ? `${draft.weight}%` : "—"} />
          <SummaryRow label="Due" value={draft.dueWeek ? `Week ${draft.dueWeek}` : "Optional"} />
          <SummaryRow
            label="Duration"
            value={draft.durationWeeks ? `${draft.durationWeeks} weeks` : "Optional"}
          />
          <SummaryRow label="Mode" value={draft.mode === "group" ? "Group" : "Individual"} />
          <SummaryRow
            label="CLOs"
            value={draft.cloCodes.length ? draft.cloCodes.join(", ") : "—"}
          />
          <SummaryRow
            label="Rubric"
            value={rubric?.name ?? (draft.rubricId ? "Unavailable rubric" : "—")}
          />
          <SummaryRow label="Feedback" value={draft.feedbackMethod || "—"} />
          <SummaryRow
            label="Feedback Timeline"
            value={draft.feedbackTimeline || "Optional"}
          />
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-accent-foreground">
          Assessment Plan Overview
        </h3>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Current allocated</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {displayWeight(allocatedWeight)}%
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Remaining</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {displayWeight(remainingWeight)}%
            </p>
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          {otherAssessments.length ? (
            otherAssessments.map((item) => (
              <div
                key={item.id}
                className="flex justify-between gap-3 border-b border-border px-3 py-2 text-xs"
              >
                <span className="truncate">{item.name || "Untitled assessment"}</span>
                <span className="shrink-0 font-semibold">
                  {item.weight !== ""
                    ? `${displayWeight(numberWeight(item.weight))}%`
                    : "—"}
                </span>
              </div>
            ))
          ) : (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No other assessments yet.
            </p>
          )}
          <div className="flex justify-between gap-3 bg-accent/5 px-3 py-2 text-xs">
            <span>
              <span className="block font-semibold">
                {draft.name || "This assessment"}
              </span>
              <span className="text-muted-foreground">(This assessment)</span>
            </span>
            <span className="shrink-0 font-semibold text-accent-foreground">
              {draft.weight !== "" ? `${displayWeight(currentWeight)}%` : "—"}
            </span>
          </div>
        </div>
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <SummaryRow label="Other assessments" value={`${displayWeight(allocatedWeight)}%`} />
          <SummaryRow
            label="This assessment"
            value={draft.weight !== "" ? `${displayWeight(currentWeight)}%` : "—"}
          />
          <SummaryRow
            label="Total after save"
            value={`${displayWeight(totalAfterSave)}%${
              Math.abs(totalAfterSave - 100) < 0.001 ? " ✓" : ""
            }`}
          />
        </div>
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-xs ${
            totalAfterSave > 100
              ? "border border-status-live/40 bg-status-live/10 text-status-live"
              : "border border-accent/30 bg-accent/5 text-muted-foreground"
          }`}
        >
          {totalAfterSave > 100
            ? "Total assessment weight would exceed 100%."
            : "The total weight of all assessments should equal 100%."}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-bold uppercase tracking-wide text-accent-foreground">
          Checklist
        </h3>
        <div className="mt-3 space-y-2">
          {checks.map(([label, ok]) => (
            <div key={label} className="flex items-center gap-2 text-sm">
              <span aria-hidden>{ok ? "✓" : "○"}</span>
              <span className={ok ? "text-foreground" : "text-muted-foreground"}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 border-b border-border pb-2 last:border-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}
