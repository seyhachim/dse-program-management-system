import {
  SPEC_SECTIONS,
  type CourseSpecExactVersionView,
  type CourseSpecReview,
  type CourseSpecReviewStatus,
  type CourseSpecSectionComparison,
  type CourseSpecVersionComparisonView,
  type CourseSpecVersionHistoryItem,
  type CourseSpecVersionHistoryView,
  type SpecSectionId,
  type TeachingLearningProfile,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

const SPEC_INCLUDE = {
  sections: true,
  courseInfo: true,
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
  reviewActions: { orderBy: { createdAt: "desc" as const } },
  studentResponsibilities: { orderBy: { order: "asc" as const } },
  policy: true,
} satisfies Prisma.CourseSpecInclude;

type SpecRow = Prisma.CourseSpecGetPayload<{ include: typeof SPEC_INCLUDE }>;

type PeriodicReviewRow = {
  courseSpecId: string;
  outcome: "Reaffirmed" | "MinorRevision" | "MajorRevision";
  nextReviewDueAt: Date | null;
  reviewedAt: Date;
  createdAt: Date;
};

const reviewStatusMap: Record<string, CourseSpecReviewStatus> = {
  Draft: "draft",
  Submitted: "submitted",
  UnderReview: "underReview",
  ChangesRequested: "changesRequested",
  Resubmitted: "resubmitted",
  Approved: "approved",
};

function reviewEnvelope(spec: SpecRow): CourseSpecReview {
  return {
    status: reviewStatusMap[spec.reviewStatus]!,
    submissionVersion: spec.submissionVersion,
    submittedAt: spec.submittedAt?.toISOString() ?? null,
    submittedById: spec.submittedById,
    submissionNote: spec.submissionNote,
    actions: spec.reviewActions.map((action) => ({
      id: action.id,
      submissionVersion: action.submissionVersion,
      action:
        action.action === "Submitted"
          ? "submitted"
          : action.action === "Resubmitted"
            ? "resubmitted"
            : action.action === "ChangesRequested"
              ? "changesRequested"
              : "approved",
      actorId: action.actorId,
      note: action.note,
      createdAt: action.createdAt.toISOString(),
    })),
  };
}

function reassemble(spec: SpecRow) {
  const data: Record<string, unknown> = {};
  const status: Record<string, "draft" | "complete"> = {};
  for (const section of spec.sections) {
    status[section.sectionKey] = section.status === "Complete" ? "complete" : "draft";
  }
  const has = (key: SpecSectionId) => spec.sections.some((row) => row.sectionKey === key);

  if (spec.courseInfo) {
    data.courseInfo = {
      programmeTitle: spec.courseInfo.programmeTitle,
      courseTitle: spec.courseInfo.courseTitle,
      courseCode: spec.courseInfo.courseCode,
      credits: spec.courseInfo.credits,
      prerequisites: spec.courseInfo.prerequisites,
      courseType: spec.courseInfo.courseType,
      description: spec.courseInfo.description,
      totalSltHours: spec.courseInfo.totalSltHours,
      instructorName: spec.courseInfo.instructorName,
      instructorTitle: spec.courseInfo.instructorTitle,
      qualification: spec.courseInfo.qualification,
      email: spec.courseInfo.email,
      telephone: spec.courseInfo.telephone,
      otherLecturers: spec.courseInfo.otherLecturers,
      semester: spec.courseInfo.semester,
      programmeYear: spec.courseInfo.programmeYear,
    };
  }
  if (has("clos")) {
    data.clos = { items: spec.clos.map((clo) => ({
      id: clo.id,
      code: `CLO${clo.order + 1}`,
      description: clo.description,
      level: clo.level,
      mappedPlos: clo.mappedPlos,
      sltHours: clo.sltHours,
      teachingMethodIds: clo.teachingMethods.map((row) => row.teachingMethodId),
      activeLearningStrategyIds: clo.activeLearningStrategyIds,
      assessmentMethodIds: clo.assessmentMethods.map((row) => row.assessmentMethodId),
      status: clo.status === "Inactive" ? "inactive" : "active",
      notes: clo.notes,
    })) };
  }
  if (has("slt")) {
    data.slt = { weeks: spec.weeks.map((w) => ({
      id: w.id, week: w.week, topic: w.topic, cloCodes: w.cloCodes, lloItems: w.lloItems,
      lessonLearningOutcomes: w.lessonLearningOutcomes ?? [], activities: w.activities,
      studentLearningActivities: w.studentLearningActivities ?? [], lectureHours: w.lectureHours,
      tutorialHours: w.tutorialHours, practiceHours: w.practiceHours, otherHours: w.otherHours,
      selfStudyHours: w.selfStudyHours, teachingMethodIds: w.teachingMethodIds,
      teachingResourceTypes: w.teachingResourceTypes, assessmentMethodIds: w.assessmentMethodIds,
      assessment: w.assessment,
    })) };
  }
  if (has("assessmentPlan")) {
    data.assessmentPlan = { items: spec.assessmentItems.map((item) => ({
      id: item.id, name: item.name, type: item.type, description: item.description,
      mode: item.mode === "Group" ? "group" : "individual",
      status: item.status === "Inactive" ? "inactive" : "active",
      cloCodes: item.cloCodes, weight: item.weight, dueWeek: item.dueWeek,
      durationWeeks: item.durationWeeks, format: item.format, submissionMethod: item.submissionMethod,
      instructions: item.instructions, rubricId: item.rubricId,
      criterionCloMappings: Object.values(item.criterionCloMappings.reduce<Record<string, { criterionId: string; cloCodes: string[] }>>((acc, mapping) => {
        const row = acc[mapping.criterionId] ?? { criterionId: mapping.criterionId, cloCodes: [] };
        row.cloCodes.push(mapping.cloCode); acc[mapping.criterionId] = row; return acc;
      }, {})),
      feedbackMethod: item.feedbackMethod, feedbackTimeline: item.feedbackTimeline,
      mappedPlos: item.mappedPlos, notes: item.notes,
    })) };
  }
  if (has("mapping")) data.mapping = { cells: spec.mappingCells.map((cell) => ({
    cloCode: cell.cloCode, kind: cell.kind === "Assessment" ? "assessment" : "week", ref: cell.ref, strength: cell.strength,
  })) };
  if (has("resources")) data.resources = { items: spec.resources.filter((r) => r.section === "Resource").map((r) => ({
    id: r.id, resourceType: r.resourceType, title: r.title, url: r.url, notes: r.notes,
    evidenceWeekIds: r.evidenceWeekIds.length ? r.evidenceWeekIds : r.weekId ? [r.weekId] : [],
  })) };
  if (has("references")) data.references = { items: spec.resources.filter((r) => r.section === "Reference").map((r) => ({
    id: r.id, kind: r.kind, title: r.title, authors: r.authors, publisher: r.publisher,
    year: r.year, isbn: r.isbn, url: r.url, basedOn: r.basedOn, notes: r.notes,
  })) };
  if (has("responsibility")) data.responsibility = { items: spec.studentResponsibilities.map((r) => ({ id: r.id, text: r.text })) };
  if (has("policy") && spec.policy) data.policy = {
    attendancePreparation: spec.policy.attendancePreparation,
    academicIntegrity: spec.policy.academicIntegrity,
    assignmentsLateSubmission: spec.policy.assignmentsLateSubmission,
    examinationRules: spec.policy.examinationRules,
    penaltiesConsequences: spec.policy.penaltiesConsequences,
  };
  if (has("date")) data.date = { date: spec.specDate?.toISOString().slice(0, 10) ?? null };
  return { data, status };
}

async function periodicReviews(courseId: string): Promise<PeriodicReviewRow[]> {
  return prisma.$queryRaw<PeriodicReviewRow[]>(Prisma.sql`
    SELECT pr."courseSpecId", pr."outcome", pr."nextReviewDueAt", pr."reviewedAt", pr."createdAt"
    FROM "course_spec_governance"."CourseSpecPeriodicReview" pr
    JOIN "CourseSpec" cs ON cs."id" = pr."courseSpecId"
    WHERE cs."courseId" = ${courseId}
    ORDER BY pr."reviewedAt" DESC, pr."createdAt" DESC
  `);
}

function toHistoryItem(
  spec: Pick<SpecRow, "id" | "courseId" | "versionMajor" | "versionMinor" | "revisionType" | "revisionReason" | "changeSummary" | "basedOnVersionId" | "reviewStatus" | "submissionVersion" | "approvedAt" | "effectiveFrom" | "nextReviewDueAt">,
  latestId: string | null,
  review?: PeriodicReviewRow,
): CourseSpecVersionHistoryItem {
  return {
    id: spec.id,
    courseId: spec.courseId,
    versionMajor: spec.versionMajor,
    versionMinor: spec.versionMinor,
    academicVersion: `${spec.versionMajor}.${spec.versionMinor}`,
    revisionType: spec.revisionType,
    revisionReason: spec.revisionReason,
    changeSummary: spec.changeSummary,
    basedOnVersionId: spec.basedOnVersionId,
    reviewStatus: spec.reviewStatus,
    submissionVersion: spec.submissionVersion,
    approvedAt: spec.approvedAt?.toISOString() ?? null,
    effectiveFrom: spec.effectiveFrom?.toISOString().slice(0, 10) ?? null,
    storedNextReviewDueAt: spec.nextReviewDueAt?.toISOString().slice(0, 10) ?? null,
    effectiveNextReviewDueAt: review?.nextReviewDueAt?.toISOString().slice(0, 10) ?? spec.nextReviewDueAt?.toISOString().slice(0, 10) ?? null,
    latestPeriodicReviewOutcome: review?.outcome ?? null,
    isCurrent: spec.id === latestId,
    editable: spec.id === latestId && ["Draft", "ChangesRequested"].includes(spec.reviewStatus),
  };
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalize(child)]));
}

function collectChangedPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b))) return [];
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) return [prefix || "value"];
  const keys = [...new Set([...Object.keys(a as Record<string, unknown>), ...Object.keys(b as Record<string, unknown>)])].sort();
  return keys.flatMap((key) => collectChangedPaths((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], prefix ? `${prefix}.${key}` : key));
}

async function history(courseId: string): Promise<CourseSpecVersionHistoryView> {
  const [specs, reviews] = await Promise.all([
    prisma.courseSpec.findMany({ where: { courseId }, orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }], include: SPEC_INCLUDE }),
    periodicReviews(courseId),
  ]);
  const latestId = specs[0]?.id ?? null;
  const latestReviewBySpec = new Map<string, PeriodicReviewRow>();
  for (const review of reviews) if (!latestReviewBySpec.has(review.courseSpecId)) latestReviewBySpec.set(review.courseSpecId, review);
  return { courseId, currentVersionId: latestId, versions: specs.map((spec) => toHistoryItem(spec, latestId, latestReviewBySpec.get(spec.id))) };
}

async function exactVersion(courseId: string, versionId: string): Promise<CourseSpecExactVersionView | null> {
  const [spec, historyView] = await Promise.all([
    prisma.courseSpec.findFirst({ where: { id: versionId, courseId }, include: SPEC_INCLUDE }),
    history(courseId),
  ]);
  if (!spec) return null;
  const { data, status } = reassemble(spec);
  const teachingRows = await prisma.$queryRaw<TeachingLearningProfile[]>(Prisma.sql`
    SELECT "philosophyTags", "philosophyStatement", "teachingMethodIds", "activeLearningStrategyIds", "independentLearningTypes", "resourceTypes", "technologyTypes"
    FROM "CourseSpecTeachingLearning" WHERE "courseSpecId" = ${versionId} LIMIT 1
  `);
  const teachingLearning: TeachingLearningProfile = teachingRows[0] ?? {
    philosophyTags: [], philosophyStatement: "", teachingMethodIds: [], activeLearningStrategyIds: [], independentLearningTypes: [], resourceTypes: [], technologyTypes: [],
  };
  const version = historyView.versions.find((row) => row.id === versionId)!;
  return { courseId, version, data, status, review: reviewEnvelope(spec), teachingLearning };
}

async function compare(courseId: string, fromId: string, toId: string): Promise<CourseSpecVersionComparisonView | null> {
  const [from, to] = await Promise.all([exactVersion(courseId, fromId), exactVersion(courseId, toId)]);
  if (!from || !to) return null;
  const sections: CourseSpecSectionComparison[] = SPEC_SECTIONS.filter((section) => section.id !== "programme").map((section) => {
    const sectionId = section.id as SpecSectionId;
    const changedPaths = collectChangedPaths(from.data[sectionId], to.data[sectionId]);
    return { sectionId, label: section.title, changed: changedPaths.length > 0, changedPaths };
  });
  const tlPaths = collectChangedPaths(from.teachingLearning, to.teachingLearning);
  if (tlPaths.length) sections.push({ sectionId: "clos", label: "Teaching & Learning", changed: true, changedPaths: tlPaths.map((path) => `teachingLearning.${path}`) });
  return {
    courseId,
    fromVersion: { id: from.version.id, academicVersion: from.version.academicVersion, reviewStatus: from.version.reviewStatus, submissionVersion: from.version.submissionVersion },
    toVersion: { id: to.version.id, academicVersion: to.version.academicVersion, reviewStatus: to.version.reviewStatus, submissionVersion: to.version.submissionVersion },
    changedSectionCount: sections.filter((section) => section.changed).length,
    sections,
  };
}

export const courseSpecVersionHistoryService = { history, exactVersion, compare };
