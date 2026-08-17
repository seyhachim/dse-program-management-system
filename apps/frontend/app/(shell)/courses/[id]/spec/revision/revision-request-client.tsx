"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  COURSE_SPEC_MAJOR_IMPACT_FIELDS,
  type CourseSpecRevisionImpact,
  type CourseSpecRevisionTrigger,
  type CourseSpecRevisionType,
  CreateCourseSpecRevisionRequestSchema,
  recommendedCourseSpecRevisionType,
} from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { useMe } from "@/lib/auth";
import { courseSpecApi } from "@/lib/course-spec";
import { courseSpecRevisionApi } from "@/lib/course-spec-revision";
import { coursesApi, type CourseView } from "@/lib/courses";

const TRIGGERS: { value: CourseSpecRevisionTrigger; label: string }[] = [
  { value: "ScheduledReview", label: "Scheduled review" },
  { value: "StudentFeedback", label: "Student feedback" },
  { value: "AlumniFeedback", label: "Alumni feedback" },
  { value: "EmployerFeedback", label: "Employer feedback" },
  { value: "LecturerReflection", label: "Lecturer reflection" },
  { value: "ProgrammeCoordinator", label: "Programme coordinator" },
  { value: "ExternalExaminer", label: "External examiner" },
  { value: "QaFinding", label: "QA finding" },
  { value: "RegulatoryChange", label: "Regulatory change" },
  { value: "Other", label: "Other" },
];

const IMPACT_LABELS: Record<(typeof COURSE_SPEC_MAJOR_IMPACT_FIELDS)[number], string> = {
  courseCodeOrTitle: "Course code or title",
  creditsOrSlt: "Credits or total Student Learning Time (SLT)",
  prerequisites: "Prerequisites",
  materialCloChanges: "Material Course Learning Outcome changes",
  bloomOrCapLevels: "Bloom / C-A-P level changes",
  cloPloAlignment: "CLO–PLO alignment changes",
  assessmentStructureOrWeighting: "Substantial assessment structure or weighting changes",
  curriculumOrRegulatoryAlignment: "Curriculum or regulatory alignment",
};

const EMPTY_IMPACT: CourseSpecRevisionImpact = {
  courseCodeOrTitle: false,
  creditsOrSlt: false,
  prerequisites: false,
  materialCloChanges: false,
  bloomOrCapLevels: false,
  cloPloAlignment: false,
  assessmentStructureOrWeighting: false,
  curriculumOrRegulatoryAlignment: false,
};

export function RevisionRequestClient({ courseId }: { courseId: string }) {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggers, setTriggers] = useState<CourseSpecRevisionTrigger[]>([]);
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [impact, setImpact] = useState<CourseSpecRevisionImpact>(EMPTY_IMPACT);
  const [proposedRevisionType, setProposedRevisionType] =
    useState<CourseSpecRevisionType>("Minor");
  const [effectiveAcademicTerm, setEffectiveAcademicTerm] = useState("");
  const [overrideJustification, setOverrideJustification] = useState("");

  const recommendedRevisionType = useMemo(
    () => recommendedCourseSpecRevisionType(impact),
    [impact],
  );
  const overridingMajor =
    recommendedRevisionType === "Major" && proposedRevisionType === "Minor";
  const hasGovernanceRole =
    me?.roles.some((role) => role === "admin" || role === "program_coordinator") ?? false;

  useEffect(() => {
    let active = true;
    Promise.all([coursesApi.get(courseId), courseSpecApi.get(courseId)])
      .then(([courseResult, spec]) => {
        if (!active) return;
        setCourse(courseResult);
        setReviewStatus(spec.review.status);
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Could not load course"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [courseId]);

  const toggleTrigger = (trigger: CourseSpecRevisionTrigger) => {
    setTriggers((current) =>
      current.includes(trigger)
        ? current.filter((item) => item !== trigger)
        : [...current, trigger],
    );
  };

  const submit = async () => {
    setError(null);
    const parsed = CreateCourseSpecRevisionRequestSchema.safeParse({
      triggers,
      evidenceSummary,
      changeSummary,
      impact,
      proposedRevisionType,
      effectiveAcademicTerm,
      overrideJustification,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please review the revision request");
      return;
    }

    setSubmitting(true);
    try {
      await courseSpecRevisionApi.create(courseId, parsed.data);
      router.push(`/courses/${courseId}/spec?tab=overview`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create revision");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || meLoading) {
    return <p className="mx-auto max-w-5xl text-sm text-muted-foreground">Loading revision workspace…</p>;
  }

  if (!hasGovernanceRole) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-destructive/30 bg-card p-6">
        <h2 className="text-lg font-semibold">Revision creation is restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only the programme coordinator / Head of Programme or an administrator may create an academic revision.
        </p>
        <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href={`/courses/${courseId}/spec`} />}>
          Back to Course Specification
        </Button>
      </div>
    );
  }

  if (reviewStatus !== "approved") {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-amber-300 bg-card p-6">
        <h2 className="text-lg font-semibold">An approved source version is required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete the current Course Specification review workflow before creating another academic revision.
        </p>
        <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href={`/courses/${courseId}/spec`} />}>
          Back to Course Specification
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{course?.code}</p>
          <h1 className="text-2xl font-bold">{course?.title ?? "Course revision"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Record why this revision is needed and assess its academic impact before a draft is created.
          </p>
        </div>
        <Button variant="outline" nativeButton={false} render={<Link href={`/courses/${courseId}/spec`} />}>
          Cancel
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">1. Revision triggers</h2>
        <p className="mt-1 text-xs text-muted-foreground">Select every source that triggered this revision.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TRIGGERS.map((item) => (
            <label key={item.value} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={triggers.includes(item.value)}
                onChange={() => toggleTrigger(item.value)}
              />
              {item.label}
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-5 lg:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          <span>2. Evidence / feedback summary</span>
          <textarea
            className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm font-normal"
            value={evidenceSummary}
            onChange={(event) => setEvidenceSummary(event.target.value)}
            placeholder="Summarize stakeholder feedback, QA findings, review evidence, or other rationale."
          />
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>3. Change summary</span>
          <textarea
            className="min-h-36 w-full rounded-md border bg-background px-3 py-2 text-sm font-normal"
            value={changeSummary}
            onChange={(event) => setChangeSummary(event.target.value)}
            placeholder="Describe the intended academic changes at a high level."
          />
        </label>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">4. Major-impact assessment</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Selecting any item deterministically recommends a Major revision.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              recommendedRevisionType === "Major"
                ? "bg-amber-100 text-amber-900"
                : "bg-emerald-100 text-emerald-900"
            }`}
          >
            Recommended: {recommendedRevisionType}
          </span>
        </div>
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {COURSE_SPEC_MAJOR_IMPACT_FIELDS.map((field) => (
            <label key={field} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                className="mt-0.5"
                type="checkbox"
                checked={impact[field]}
                onChange={(event) =>
                  setImpact((current) => ({ ...current, [field]: event.target.checked }))
                }
              />
              <span>{IMPACT_LABELS[field]}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border bg-card p-5 lg:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          <span>5. Proposed revision type</span>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-normal"
            value={proposedRevisionType}
            onChange={(event) => setProposedRevisionType(event.target.value as CourseSpecRevisionType)}
          >
            <option value="Minor">Minor</option>
            <option value="Major">Major</option>
          </select>
        </label>
        <label className="space-y-2 text-sm font-medium">
          <span>6. Effective academic term</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-normal"
            value={effectiveAcademicTerm}
            onChange={(event) => setEffectiveAcademicTerm(event.target.value)}
            placeholder="e.g. 2027–2028 Semester I"
          />
        </label>

        {overridingMajor ? (
          <label className="space-y-2 text-sm font-medium lg:col-span-2">
            <span>Required override justification</span>
            <textarea
              className="min-h-28 w-full rounded-md border border-amber-400 bg-background px-3 py-2 text-sm font-normal"
              value={overrideJustification}
              onChange={(event) => setOverrideJustification(event.target.value)}
              placeholder="Explain why a Minor revision remains appropriate despite the Major-impact assessment."
            />
            <span className="block text-xs font-normal text-amber-700">
              The recommendation remains Major in the immutable record even when an authorized override creates a Minor revision.
            </span>
          </label>
        ) : null}
      </section>

      <div className="flex justify-end gap-3">
        <Button variant="outline" nativeButton={false} render={<Link href={`/courses/${courseId}/spec`} />}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Creating revision…" : `Create ${proposedRevisionType} revision`}
        </Button>
      </div>
    </div>
  );
}
