"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CourseSpecExactVersionView, Method, ProgrammeAcademicConfig, Rubric } from "@dse-pms/shared-types";
import { Button } from "@dse-pms/ui";
import { api } from "@/lib/api";
import { courseSpecHistoryApi, comparisonHref } from "@/lib/course-spec-history";
import { methodsApi } from "@/lib/methods";
import { rubricsApi } from "@/lib/rubrics";
import { buildCourseDocument } from "../../course-document-model";
import { DocumentPreview } from "../../document-preview";
import { toCourseInfoForm } from "../../course-info-section";
import { toClosForm } from "../../clos-section";
import { toWeeklyPlanForm } from "../../weekly-plan-section";
import { toAssessmentForm } from "../../assessment-section";
import { toMappingForm } from "../../mapping-model";
import { toResourcesForm } from "../../resources-model";
import { toReferencesForm } from "../../references-model";
import { EMPTY_POLICY } from "../../policy-section";
import { EMPTY_DATE } from "../../date-section";
import { EMPTY_STUDENT_RESPONSIBILITY } from "../../student-responsibility-section";

export function HistoricalVersionClient({ courseId, versionId }: { courseId: string; versionId: string }) {
  const [version, setVersion] = useState<CourseSpecExactVersionView | null>(null);
  const [methods, setMethods] = useState<{ teaching: Method[]; assessment: Method[] }>({ teaching: [], assessment: [] });
  const [programme, setProgramme] = useState<ProgrammeAcademicConfig | null>(null);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [previousId, setPreviousId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      courseSpecHistoryApi.get(courseId, versionId),
      courseSpecHistoryApi.list(courseId),
      methodsApi.list(),
      api.get<ProgrammeAcademicConfig>("/api/programme"),
      rubricsApi.list().catch(() => [] as Rubric[]),
    ]).then(([exact, history, methodList, programmeConfig, rubricList]) => {
      setVersion(exact);
      setMethods(methodList);
      setProgramme(programmeConfig);
      setRubrics(rubricList);
      const index = history.versions.findIndex((item) => item.id === versionId);
      setPreviousId(index >= 0 ? history.versions[index + 1]?.id ?? null : null);
    }).catch(() => setError("Could not load this historical course specification version."));
  }, [courseId, versionId]);

  const document = useMemo(() => {
    if (!version) return null;
    const data = version.data;
    const courseInfo = toCourseInfoForm(data.courseInfo as Record<string, unknown> | undefined);
    const clos = toClosForm(data.clos, data.cloMapping);
    const weeklyPlan = toWeeklyPlanForm(data.slt);
    const assessments = toAssessmentForm(data.assessmentPlan);
    return buildCourseDocument({
      courseInfo,
      courseId,
      clos,
      weeklyPlan,
      assessments,
      rubrics,
      mapping: toMappingForm(data.mapping),
      teachingMethods: methods.teaching,
      assessmentMethods: methods.assessment,
      programme,
      teachingLearningProfile: version.teachingLearning,
      resources: toResourcesForm(data.resources),
      references: toReferencesForm(data.references),
      responsibility: (data.responsibility as typeof EMPTY_STUDENT_RESPONSIBILITY | undefined) ?? EMPTY_STUDENT_RESPONSIBILITY,
      policy: (data.policy as typeof EMPTY_POLICY | undefined) ?? EMPTY_POLICY,
      specDate: (data.date as typeof EMPTY_DATE | undefined) ?? EMPTY_DATE,
      courseTotalSlt: courseInfo.totalSltHours ?? null,
    });
  }, [courseId, methods, programme, rubrics, version]);

  if (error) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>;
  if (!version || !document) return <p className="text-sm text-muted-foreground">Loading historical version…</p>;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-blue-200/70 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">Historical academic version v{version.version.academicVersion} · read-only</p>
            <p className="text-sm text-muted-foreground">
              Review status: {version.version.reviewStatus} · submission attempt {version.version.submissionVersion} · effective {version.version.effectiveFrom ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<Link href={`/courses/${courseId}/spec`} />}>Back to current version</Button>
            {previousId ? <Button variant="outline" render={<Link href={comparisonHref(courseId, previousId, versionId)} />}>Compare with previous</Button> : null}
          </div>
        </div>
      </section>
      <DocumentPreview document={document} courseSpecId={versionId} />
    </div>
  );
}
