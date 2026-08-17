import { randomUUID } from "node:crypto";
import { Prisma, type CourseSpecRevisionTrigger, type CourseSpecRevisionType } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import {
  buildCourseInfoSnapshotByCourseId,
  courseInfoSnapshotData,
} from "./course-info-snapshot.ts";

export type AcademicVersion = { major: number; minor: number };
export type RevisionKind = Exclude<CourseSpecRevisionType, "Initial">;

export class CourseSpecRevisionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "COURSE_NOT_FOUND"
      | "SOURCE_NOT_APPROVED"
      | "OPEN_REVISION_EXISTS"
      | "INITIATOR_NOT_FOUND",
  ) {
    super(message);
    this.name = "CourseSpecRevisionError";
  }
}

export function nextAcademicVersion(
  current: AcademicVersion,
  type: RevisionKind,
): AcademicVersion {
  return type === "Major"
    ? { major: current.major + 1, minor: 0 }
    : { major: current.major, minor: current.minor + 1 };
}

const OPEN_STATUSES = [
  "Draft",
  "Submitted",
  "UnderReview",
  "ChangesRequested",
  "Resubmitted",
] as const;

const SOURCE_INCLUDE = {
  sections: true,
  clos: {
    include: { teachingMethods: true, assessmentMethods: true },
    orderBy: { order: "asc" as const },
  },
  weeks: { orderBy: { order: "asc" as const } },
  assessmentItems: {
    orderBy: { order: "asc" as const },
    include: { criterionCloMappings: true },
  },
  mappingCells: true,
  resources: { orderBy: { order: "asc" as const } },
  studentResponsibilities: { orderBy: { order: "asc" as const } },
  policy: true,
  teachingLearning: true,
  weekProjectProgress: true,
} satisfies Prisma.CourseSpecInclude;

type SourceSpec = Prisma.CourseSpecGetPayload<{ include: typeof SOURCE_INCLUDE }>;

export type CreateCourseSpecRevisionInput = {
  courseId: string;
  revisionType: RevisionKind;
  triggers: CourseSpecRevisionTrigger[];
  reason: string;
  changeSummary: string;
  initiatedById: string;
};

export const courseSpecRevisionService = {
  async createCourseSpecRevision(input: CreateCourseSpecRevisionInput) {
    const courseInfoSnapshot = await buildCourseInfoSnapshotByCourseId(input.courseId);
    if (!courseInfoSnapshot) {
      throw new CourseSpecRevisionError("Course not found", "COURSE_NOT_FOUND");
    }
    return prisma.$transaction(async (tx) => {
      const [course, initiator, openRevision, source] = await Promise.all([
        tx.course.findUnique({ where: { id: input.courseId }, select: { id: true } }),
        tx.user.findUnique({ where: { id: input.initiatedById }, select: { id: true } }),
        tx.courseSpec.findFirst({
          where: { courseId: input.courseId, reviewStatus: { in: [...OPEN_STATUSES] } },
          select: { id: true, versionMajor: true, versionMinor: true },
        }),
        tx.courseSpec.findFirst({
          where: { courseId: input.courseId, reviewStatus: "Approved" },
          orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
          include: SOURCE_INCLUDE,
        }),
      ]);

      if (!course) {
        throw new CourseSpecRevisionError("Course not found", "COURSE_NOT_FOUND");
      }
      if (!initiator) {
        throw new CourseSpecRevisionError(
          "Revision initiator does not exist",
          "INITIATOR_NOT_FOUND",
        );
      }
      if (openRevision) {
        throw new CourseSpecRevisionError(
          `Course already has an open academic revision ${openRevision.versionMajor}.${openRevision.versionMinor}`,
          "OPEN_REVISION_EXISTS",
        );
      }
      if (!source) {
        throw new CourseSpecRevisionError(
          "An approved course specification is required before creating a revision",
          "SOURCE_NOT_APPROVED",
        );
      }

      const next = nextAcademicVersion(
        { major: source.versionMajor, minor: source.versionMinor },
        input.revisionType,
      );

      const target = await tx.courseSpec.create({
        data: {
          courseId: input.courseId,
          versionMajor: next.major,
          versionMinor: next.minor,
          revisionType: input.revisionType,
          revisionTriggers: input.triggers,
          revisionReason: input.reason.trim(),
          changeSummary: input.changeSummary.trim(),
          basedOnVersionId: source.id,
          reviewStatus: "Draft",
          submissionVersion: 0,
          submittedAt: null,
          submittedById: null,
          submissionNote: "",
          approvedAt: null,
          effectiveFrom: null,
          nextReviewDueAt: null,
          contentHash: null,
          courseInfo: { create: courseInfoSnapshotData(courseInfoSnapshot) },
        },
      });

      await cloneNormalizedContent(tx, source, target.id);

      return {
        id: target.id,
        courseId: target.courseId,
        versionMajor: target.versionMajor,
        versionMinor: target.versionMinor,
        revisionType: target.revisionType,
        revisionTriggers: target.revisionTriggers,
        revisionReason: target.revisionReason,
        changeSummary: target.changeSummary,
        basedOnVersionId: target.basedOnVersionId,
        reviewStatus: target.reviewStatus,
        submissionVersion: target.submissionVersion,
      };
    });
  },
};

async function cloneNormalizedContent(
  tx: Prisma.TransactionClient,
  source: SourceSpec,
  targetCourseSpecId: string,
): Promise<void> {
  const cloIdMap = new Map(source.clos.map((row) => [row.id, randomUUID()]));
  const weekIdMap = new Map(source.weeks.map((row) => [row.id, randomUUID()]));
  const assessmentIdMap = new Map(
    source.assessmentItems.map((row) => [row.id, randomUUID()]),
  );
  const resourceIdMap = new Map(
    source.resources.map((row) => [row.id, randomUUID()]),
  );
  const responsibilityIdMap = new Map(
    source.studentResponsibilities.map((row) => [row.id, randomUUID()]),
  );

  if (source.sections.length > 0) {
    await tx.courseSpecSection.createMany({
      data: source.sections.map((row) => ({
        courseSpecId: targetCourseSpecId,
        sectionKey: row.sectionKey,
        status: row.status,
      })),
    });
  }

  if (source.clos.length > 0) {
    await tx.courseSpecClo.createMany({
      data: source.clos.map((row) => ({
        id: cloIdMap.get(row.id)!,
        courseSpecId: targetCourseSpecId,
        order: row.order,
        description: row.description,
        level: row.level,
        mappedPlos: row.mappedPlos,
        sltHours: row.sltHours,
        status: row.status,
        notes: row.notes,
        activeLearningStrategyIds: row.activeLearningStrategyIds,
      })),
    });

    const teachingMethods = source.clos.flatMap((row) =>
      row.teachingMethods.map((link) => ({
        courseSpecId: targetCourseSpecId,
        cloId: cloIdMap.get(row.id)!,
        teachingMethodId: link.teachingMethodId,
      })),
    );
    if (teachingMethods.length > 0) {
      await tx.courseSpecCloTeachingMethod.createMany({ data: teachingMethods });
    }

    const assessmentMethods = source.clos.flatMap((row) =>
      row.assessmentMethods.map((link) => ({
        courseSpecId: targetCourseSpecId,
        cloId: cloIdMap.get(row.id)!,
        assessmentMethodId: link.assessmentMethodId,
      })),
    );
    if (assessmentMethods.length > 0) {
      await tx.courseSpecCloAssessmentMethod.createMany({ data: assessmentMethods });
    }
  }

  for (const row of source.weeks) {
    await tx.courseSpecWeek.create({
      data: {
        id: weekIdMap.get(row.id)!,
        courseSpecId: targetCourseSpecId,
        order: row.order,
        week: row.week,
        topic: row.topic,
        cloCodes: row.cloCodes,
        lloItems: row.lloItems,
        lessonLearningOutcomes:
          row.lessonLearningOutcomes === null
            ? Prisma.JsonNull
            : (row.lessonLearningOutcomes as Prisma.InputJsonValue),
        activities: row.activities,
        studentLearningActivities:
          row.studentLearningActivities === null
            ? Prisma.JsonNull
            : (row.studentLearningActivities as Prisma.InputJsonValue),
        lectureHours: row.lectureHours,
        tutorialHours: row.tutorialHours,
        practiceHours: row.practiceHours,
        otherHours: row.otherHours,
        selfStudyHours: row.selfStudyHours,
        teachingMethodIds: row.teachingMethodIds,
        teachingResourceTypes: row.teachingResourceTypes,
        assessmentMethodIds: row.assessmentMethodIds,
        assessment: row.assessment,
      },
    });
  }

  if (source.assessmentItems.length > 0) {
    await tx.courseSpecAssessmentItem.createMany({
      data: source.assessmentItems.map((row) => ({
        id: assessmentIdMap.get(row.id)!,
        courseSpecId: targetCourseSpecId,
        order: row.order,
        name: row.name,
        type: row.type,
        description: row.description,
        mode: row.mode,
        status: row.status,
        cloCodes: row.cloCodes,
        assessmentCategory: row.assessmentCategory,
        topicNumbers: row.topicNumbers,
        physicalSltHours: row.physicalSltHours,
        onlineSltHours: row.onlineSltHours,
        independentSltHours: row.independentSltHours,
        feedbackMethod: row.feedbackMethod,
        feedbackTimeline: row.feedbackTimeline,
        weight: row.weight,
        dueWeek: row.dueWeek,
        durationWeeks: row.durationWeeks,
        format: row.format,
        submissionMethod: row.submissionMethod,
        instructions: row.instructions,
        rubricId: row.rubricId,
        mappedPlos: row.mappedPlos,
        notes: row.notes,
      })),
    });
  }

  const criterionMappings = source.assessmentItems.flatMap((assessment) =>
    assessment.criterionCloMappings.map((mapping) => ({
      courseSpecId: targetCourseSpecId,
      assessmentItemId: assessmentIdMap.get(assessment.id)!,
      rubricId: mapping.rubricId,
      criterionId: mapping.criterionId,
      criterionName: mapping.criterionName,
      rubricContentHash: mapping.rubricContentHash,
      cloCode: mapping.cloCode,
    })),
  );
  if (criterionMappings.length > 0) {
    await tx.courseSpecCriterionCloMapping.createMany({ data: criterionMappings });
  }

  if (source.mappingCells.length > 0) {
    await tx.courseSpecMappingCell.createMany({
      data: source.mappingCells.map((row) => ({
        courseSpecId: targetCourseSpecId,
        cloCode: row.cloCode,
        kind: row.kind,
        ref:
          row.kind === "Week"
            ? (weekIdMap.get(row.ref) ?? row.ref)
            : (assessmentIdMap.get(row.ref) ?? row.ref),
        strength: row.strength,
      })),
    });
  }

  if (source.resources.length > 0) {
    await tx.courseSpecResource.createMany({
      data: source.resources.map((row) => ({
        id: resourceIdMap.get(row.id)!,
        courseSpecId: targetCourseSpecId,
        order: row.order,
        section: row.section,
        weekId: row.weekId ? (weekIdMap.get(row.weekId) ?? row.weekId) : null,
        resourceType: row.resourceType,
        title: row.title,
        url: row.url,
        notes: row.notes,
        evidenceWeekIds: row.evidenceWeekIds.map(
          (weekId) => weekIdMap.get(weekId) ?? weekId,
        ),
        kind: row.kind,
        authors: row.authors,
        publisher: row.publisher,
        year: row.year,
        isbn: row.isbn,
        basedOn: row.basedOn,
      })),
    });
  }

  if (source.studentResponsibilities.length > 0) {
    await tx.courseSpecStudentResponsibility.createMany({
      data: source.studentResponsibilities.map((row) => ({
        id: responsibilityIdMap.get(row.id)!,
        courseSpecId: targetCourseSpecId,
        order: row.order,
        text: row.text,
      })),
    });
  }

  if (source.policy) {
    await tx.courseSpecPolicy.create({
      data: {
        courseSpecId: targetCourseSpecId,
        attendancePreparation: source.policy.attendancePreparation,
        academicIntegrity: source.policy.academicIntegrity,
        assignmentsLateSubmission: source.policy.assignmentsLateSubmission,
        examinationRules: source.policy.examinationRules,
        penaltiesConsequences: source.policy.penaltiesConsequences,
      },
    });
  }

  if (source.teachingLearning) {
    await tx.courseSpecTeachingLearning.create({
      data: {
        courseSpecId: targetCourseSpecId,
        philosophyTags: source.teachingLearning.philosophyTags,
        philosophyStatement: source.teachingLearning.philosophyStatement,
        teachingMethodIds: source.teachingLearning.teachingMethodIds,
        activeLearningStrategyIds:
          source.teachingLearning.activeLearningStrategyIds,
        independentLearningTypes:
          source.teachingLearning.independentLearningTypes,
        resourceTypes: source.teachingLearning.resourceTypes,
        technologyTypes: source.teachingLearning.technologyTypes,
      },
    });
  }

  if (source.weekProjectProgress.length > 0) {
    await tx.courseSpecWeekProjectProgress.createMany({
      data: source.weekProjectProgress.map((row) => ({
        courseSpecId: targetCourseSpecId,
        weekId: weekIdMap.get(row.weekId) ?? row.weekId,
        milestone: row.milestone,
        expectedProgress: row.expectedProgress,
        deliverable: row.deliverable,
        status: row.status,
      })),
    });
  }
}
