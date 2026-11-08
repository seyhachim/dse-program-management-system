import {
  COURSE_SPEC_AUTHORING_SECTIONS,
  deriveCourseSpecAuthoringReadinessStatus,
  type CourseSpecReadinessWeek,
  type SpecSectionStatus,
  type TeachingLearningProfile,
} from "@dse-pms/shared-types";

/**
 * Structural fields read from the exact current CourseSpec source snapshot.
 * Keep this deliberately independent of Prisma so the submission guard can
 * be regression-tested without a database or permission bypass.
 */
export type CourseSpecSubmissionSource = {
  sections: readonly { sectionKey: string; status: "Complete" | "Draft" }[];
  clos: readonly {
    order: number;
    description: string;
    status: "Active" | "Inactive";
    mappedPlos: readonly string[];
    teachingMethods: readonly { teachingMethodId: string }[];
  }[];
  weeks: readonly CourseSpecReadinessWeek[];
  assessmentItems: readonly {
    status: "Active" | "Inactive";
    cloCodes: readonly string[];
  }[];
  teachingLearning: TeachingLearningProfile | null;
};

/**
 * Canonical authoring checks for Draft -> Submitted and
 * ChangesRequested -> Resubmitted. This must not introduce a second readiness
 * policy: Overview, Review & Submit, and direct API submission use the same
 * shared source-derived rules.
 */
export function courseSpecSubmissionGaps(
  source: CourseSpecSubmissionSource,
): string[] {
  const persistedStatus: Record<string, SpecSectionStatus> = {};
  for (const section of source.sections) {
    persistedStatus[section.sectionKey] =
      section.status === "Complete" ? "complete" : "draft";
  }

  const currentStatus = deriveCourseSpecAuthoringReadinessStatus(
    persistedStatus,
    source.clos.map((clo) => ({
      code: `CLO${clo.order + 1}`,
      description: clo.description,
      status: clo.status === "Active" ? ("active" as const) : ("inactive" as const),
      mappedPlos: clo.mappedPlos,
      teachingMethodIds: clo.teachingMethods.map((method) => method.teachingMethodId),
    })),
    source.weeks,
    source.assessmentItems.map((assessment) => ({
      status:
        assessment.status === "Active"
          ? ("active" as const)
          : ("inactive" as const),
      cloCodes: assessment.cloCodes,
    })),
    { teachingLearningProfile: source.teachingLearning },
  );

  return COURSE_SPEC_AUTHORING_SECTIONS
    .filter((section) => currentStatus[section.id] !== "complete")
    .map((section) => section.title);
}
