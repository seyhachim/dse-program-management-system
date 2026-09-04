import { Prisma } from "@prisma/client";
import {
  deriveCourseSpecAuthoringReadinessStatus,
  summarizeCourseSpecAuthoringReadiness,
  type CourseSpecProgress,
  type CourseSpecReadinessWeek,
  type SpecSectionStatus,
  type TeachingLearningProfile,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

const READINESS_SPEC_SELECT = {
  id: true,
  courseId: true,
  sections: { select: { sectionKey: true, status: true } },
  clos: {
    orderBy: { order: "asc" as const },
    select: {
      order: true,
      description: true,
      status: true,
      mappedPlos: true,
      teachingMethods: { select: { teachingMethodId: true } },
    },
  },
  weeks: {
    orderBy: { order: "asc" as const },
    select: {
      topic: true,
      cloCodes: true,
      lloItems: true,
      lessonLearningOutcomes: true,
      activities: true,
      studentLearningActivities: true,
      lectureHours: true,
      tutorialHours: true,
      practiceHours: true,
      otherHours: true,
      selfStudyHours: true,
      teachingMethodIds: true,
      assessmentMethodIds: true,
      assessment: true,
    },
  },
  assessmentItems: { select: { status: true, cloCodes: true } },
  teachingLearning: true,
} satisfies Prisma.CourseSpecSelect;

type ReadinessSpecRow = Prisma.CourseSpecGetPayload<{
  select: typeof READINESS_SPEC_SELECT;
}>;

export type CourseSpecProgressReadinessSnapshot = Pick<
  ReadinessSpecRow,
  "sections" | "clos" | "weeks" | "assessmentItems" | "teachingLearning"
>;

/**
 * Recompute one already-authorized progress row from the current CourseSpec
 * source data. This is read-only and never persists derived readiness.
 */
export function applyCurrentCourseSpecReadiness(
  row: CourseSpecProgress,
  spec: CourseSpecProgressReadinessSnapshot | null,
): CourseSpecProgress {
  const persistedStatus: Record<string, SpecSectionStatus> = {};
  for (const section of spec?.sections ?? []) {
    persistedStatus[section.sectionKey] =
      section.status === "Complete" ? "complete" : "draft";
  }

  const clos = (spec?.clos ?? []).map((clo) => ({
    code: `CLO${clo.order + 1}`,
    description: clo.description,
    mappedPlos: clo.mappedPlos,
    teachingMethodIds: clo.teachingMethods.map(
      (method) => method.teachingMethodId,
    ),
    status: clo.status === "Active" ? ("active" as const) : ("inactive" as const),
  }));

  const weeks: CourseSpecReadinessWeek[] = (spec?.weeks ?? []).map((week) => ({
    topic: week.topic,
    cloCodes: week.cloCodes,
    lloItems: week.lloItems,
    lessonLearningOutcomes: week.lessonLearningOutcomes,
    activities: week.activities,
    studentLearningActivities: week.studentLearningActivities,
    lectureHours: week.lectureHours,
    tutorialHours: week.tutorialHours,
    practiceHours: week.practiceHours,
    otherHours: week.otherHours,
    selfStudyHours: week.selfStudyHours,
    teachingMethodIds: week.teachingMethodIds,
    assessmentMethodIds: week.assessmentMethodIds,
    assessment: week.assessment,
  }));

  const assessments = (spec?.assessmentItems ?? []).map((assessment) => ({
    status:
      assessment.status === "Active"
        ? ("active" as const)
        : ("inactive" as const),
    cloCodes: assessment.cloCodes,
  }));

  const effectiveStatus = deriveCourseSpecAuthoringReadinessStatus(
    persistedStatus,
    clos,
    weeks,
    assessments,
    {
      teachingLearningProfile:
        (spec?.teachingLearning as TeachingLearningProfile | null | undefined) ??
        null,
    },
  );

  return {
    ...row,
    ...summarizeCourseSpecAuthoringReadiness(effectiveStatus),
  };
}

/**
 * Enrich only the course ids that have already passed the existing Course/Offering
 * / Responsible-Lecturer scope. One batched read avoids per-course requests while
 * preserving the authorization boundary owned by the existing progress service.
 */
export async function enrichCourseSpecProgress(
  rows: CourseSpecProgress[],
): Promise<CourseSpecProgress[]> {
  if (rows.length === 0) return [];

  const courseIds = [...new Set(rows.map((row) => row.courseId))];
  const specs = await prisma.courseSpec.findMany({
    where: { courseId: { in: courseIds } },
    orderBy: [
      { courseId: "asc" },
      { versionMajor: "desc" },
      { versionMinor: "desc" },
    ],
    select: READINESS_SPEC_SELECT,
  });

  const currentSpecByCourseId = new Map<string, ReadinessSpecRow>();
  for (const spec of specs) {
    if (!currentSpecByCourseId.has(spec.courseId)) {
      currentSpecByCourseId.set(spec.courseId, spec);
    }
  }

  return rows.map((row) =>
    applyCurrentCourseSpecReadiness(
      row,
      currentSpecByCourseId.get(row.courseId) ?? null,
    ),
  );
}
