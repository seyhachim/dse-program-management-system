import {
  COMPLETABLE_SPEC_SECTIONS,
  teachingLearningIsReady,
  type AssessmentPlanSection,
  type ClosSection,
  type CourseInfoInput,
  type CourseInfoSection,
  type CourseSpecProgress,
  type CoursesServiceContract,
  type CreateCourseInput,
  type LecturerRef,
  type LecturersServiceContract,
  type ListCoursesQuery,
  type MappingSection,
  type PolicySection,
  type ResourcesSection,
  type StudentResponsibilitySection,
  type OfferingsServiceContract,
  type SpecSectionId,
  type CourseSpecReviewStatus,
  type UpdateCourseInput,
  type WeeklyPlanSection,
  type TeachingLearningProfile,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";

export class ReferenceError extends Error {}

function lecturers(): LecturersServiceContract {
  return registry.get<LecturersServiceContract>("lecturers").service;
}

function offerings(): OfferingsServiceContract {
  return registry.get<OfferingsServiceContract>("offerings").service;
}

async function assertLecturerExists(lecturerId: string | null | undefined) {
  if (!lecturerId) return;
  if (!(await lecturers().getById(lecturerId)))
    throw new ReferenceError("Assigned lecturer does not exist");
}

async function lecturerLookup(): Promise<Map<string, LecturerRef>> {
  return new Map((await lecturers().list()).map((lecturer) => [lecturer.id, lecturer]));
}

function withLecturer<T extends { lecturerId: string | null }>(
  course: T,
  lecturerById: Map<string, LecturerRef>,
) {
  return {
    ...course,
    lecturer: course.lecturerId ? lecturerById.get(course.lecturerId) ?? null : null,
  };
}

async function ownerScopeFilter(lecturerScope: string) {
  return { id: { in: await offerings().courseIdsForLecturer(lecturerScope) } };
}

const COMPLETABLE_SECTION_IDS = COMPLETABLE_SPEC_SECTIONS.map((section) => section.id);

const SPEC_INCLUDE = {
  sections: true,
  clos: {
    include: { teachingMethods: true, assessmentMethods: true },
    orderBy: { order: "asc" as const },
  },
  weeks: { orderBy: { order: "asc" as const } },
  assessmentItems: { orderBy: { order: "asc" as const } },
  mappingCells: true,
  resources: { orderBy: { order: "asc" as const } },
  reviewActions: { orderBy: { createdAt: "desc" as const } },
  studentResponsibilities: { orderBy: { order: "asc" as const } },
  policy: true,
} satisfies Prisma.CourseSpecInclude;

type SpecRow = Prisma.CourseSpecGetPayload<{ include: typeof SPEC_INCLUDE }>;

type AssessmentTemplateMeta = {
  id: string;
  assessmentCategory: string;
  topicNumbers: number[];
  physicalHours: number | null;
  onlineHours: number | null;
  independentHours: number | null;
};

type CourseSpecTemplateMeta = { documentDate: string };

async function templateMetadata(spec: SpecRow | null) {
  if (!spec)
    return {
      documentDate: "",
      assessmentById: new Map<string, AssessmentTemplateMeta>(),
    };

  const [specRows, assessmentRows] = await Promise.all([
    prisma.$queryRaw<CourseSpecTemplateMeta[]>(Prisma.sql`
      SELECT "documentDate"
      FROM "CourseSpec"
      WHERE "id" = ${spec.id}
      LIMIT 1
    `),
    prisma.$queryRaw<AssessmentTemplateMeta[]>(Prisma.sql`
      SELECT
        "id",
        "assessmentCategory",
        "topicNumbers",
        "physicalHours",
        "onlineHours",
        "independentHours"
      FROM "CourseSpecAssessmentItem"
      WHERE "courseSpecId" = ${spec.id}
    `),
  ]);

  return {
    documentDate: specRows[0]?.documentDate ?? "",
    assessmentById: new Map(assessmentRows.map((row) => [row.id, row])),
  };
}

async function reassembleSpec(spec: SpecRow | null): Promise<{
  data: Record<string, unknown>;
  status: Record<string, string>;
}> {
  const data: Record<string, unknown> = {};
  const status: Record<string, string> = {};
  if (!spec) return { data, status };

  const meta = await templateMetadata(spec);
  data.date = { value: meta.documentDate };

  for (const section of spec.sections) {
    status[section.sectionKey] = section.status === "Complete" ? "complete" : "draft";
  }
  const hasSection = (key: SpecSectionId) =>
    spec.sections.some((section) => section.sectionKey === key);

  if (hasSection("clos")) {
    data.clos = {
      items: spec.clos.map((clo) => ({
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
      })),
    };
  }

  if (hasSection("slt")) {
    data.slt = {
      weeks: spec.weeks.map((week) => ({
        id: week.id,
        week: week.week,
        topic: week.topic,
        cloCodes: week.cloCodes,
        lloItems: week.lloItems,
        lessonLearningOutcomes: week.lessonLearningOutcomes ?? [],
        activities: week.activities,
        studentLearningActivities: week.studentLearningActivities ?? [],
        lectureHours: week.lectureHours,
        tutorialHours: week.tutorialHours,
        practiceHours: week.practiceHours,
        otherHours: week.otherHours,
        selfStudyHours: week.selfStudyHours,
        teachingMethodIds: week.teachingMethodIds,
        teachingResourceTypes: week.teachingResourceTypes,
        assessmentMethodIds: week.assessmentMethodIds,
        assessment: week.assessment,
      })),
    };
  }

  if (hasSection("assessmentPlan")) {
    data.assessmentPlan = {
      items: spec.assessmentItems.map((item) => {
        const template = meta.assessmentById.get(item.id);
        return {
          id: item.id,
          name: item.name,
          type: item.type,
          description: item.description,
          mode: item.mode === "Group" ? "group" : "individual",
          status: item.status === "Inactive" ? "inactive" : "active",
          cloCodes: item.cloCodes,
          weight: item.weight,
          dueWeek: item.dueWeek,
          durationWeeks: item.durationWeeks,
          assessmentCategory:
            template?.assessmentCategory === "final" ? "final" : "continuous",
          topicNumbers: template?.topicNumbers ?? [],
          physicalHours: template?.physicalHours ?? null,
          onlineHours: template?.onlineHours ?? null,
          independentHours: template?.independentHours ?? null,
          format: item.format,
          submissionMethod: item.submissionMethod,
          instructions: item.instructions,
          rubric: item.rubric,
          feedbackMethod: item.feedbackMethod,
          feedbackTimeline: item.feedbackTimeline,
          mappedPlos: item.mappedPlos,
          notes: item.notes,
        };
      }),
    };
  }

  if (hasSection("mapping")) {
    data.mapping = {
      cells: spec.mappingCells.map((cell) => ({
        cloCode: cell.cloCode,
        kind: cell.kind === "Assessment" ? "assessment" : "week",
        ref: cell.ref,
        strength: cell.strength,
      })),
    };
  }

  if (hasSection("resources")) {
    data.resources = {
      items: spec.resources.map((resource) => ({
        id: resource.id,
        resourceType: resource.resourceType,
        title: resource.title,
        url: resource.url,
        notes: resource.notes,
        evidenceWeekIds:
          resource.evidenceWeekIds.length > 0
            ? resource.evidenceWeekIds
            : resource.weekId
              ? [resource.weekId]
              : [],
        kind: resource.kind,
        authors: resource.authors,
        publisher: resource.publisher,
        year: resource.year,
        isbn: resource.isbn,
        basedOn: resource.basedOn,
      })),
    };
  }

  if (hasSection("responsibility")) {
    data.responsibility = {
      items: spec.studentResponsibilities.map((item) => ({ id: item.id, text: item.text })),
    };
  }

  if (hasSection("policy") && spec.policy) {
    data.policy = {
      attendancePreparation: spec.policy.attendancePreparation,
      academicIntegrity: spec.policy.academicIntegrity,
      assignmentsLateSubmission: spec.policy.assignmentsLateSubmission,
      examinationRules: spec.policy.examinationRules,
      penaltiesConsequences: spec.policy.penaltiesConsequences,
    };
  }

  return { data, status };
}

function reviewEnvelope(spec: SpecRow | null) {
  const statusMap: Record<string, CourseSpecReviewStatus> = {
    Draft: "draft",
    Submitted: "submitted",
    UnderReview: "underReview",
    ChangesRequested: "changesRequested",
    Resubmitted: "resubmitted",
    Approved: "approved",
  };
  return {
    status: statusMap[spec?.reviewStatus ?? "Draft"],
    submissionVersion: spec?.submissionVersion ?? 0,
    submittedAt: spec?.submittedAt?.toISOString() ?? null,
    submittedById: spec?.submittedById ?? null,
    submissionNote: spec?.submissionNote ?? "",
    actions: (spec?.reviewActions ?? []).map((action) => ({
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

const NORMALIZED_SECTIONS = new Set<SpecSectionId>([
  "clos",
  "courseInfo",
  "slt",
  "assessmentPlan",
  "mapping",
  "resources",
  "responsibility",
  "policy",
]);

async function syncClos(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  items: ClosSection["items"],
) {
  await tx.courseSpecClo.deleteMany({ where: { courseSpecId } });
  const cloRows = items.map((item, order) => ({
    id: item.id,
    courseSpecId,
    order,
    description: item.description,
    level: item.level ?? null,
    mappedPlos: item.mappedPlos,
    sltHours: item.sltHours ?? null,
    status: item.status === "inactive" ? ("Inactive" as const) : ("Active" as const),
    notes: item.notes,
    activeLearningStrategyIds: item.activeLearningStrategyIds,
  }));
  if (cloRows.length) await tx.courseSpecClo.createMany({ data: cloRows });

  const teachingRows = items.flatMap((item) =>
    item.teachingMethodIds.map((teachingMethodId) => ({ courseSpecId, cloId: item.id, teachingMethodId })),
  );
  if (teachingRows.length)
    await tx.courseSpecCloTeachingMethod.createMany({ data: teachingRows });

  const assessmentRows = items.flatMap((item) =>
    item.assessmentMethodIds.map((assessmentMethodId) => ({ courseSpecId, cloId: item.id, assessmentMethodId })),
  );
  if (assessmentRows.length)
    await tx.courseSpecCloAssessmentMethod.createMany({ data: assessmentRows });

  const profiles = await tx.$queryRaw<TeachingLearningProfile[]>(Prisma.sql`
    SELECT "philosophyTags", "philosophyStatement", "teachingMethodIds",
      "activeLearningStrategyIds", "independentLearningTypes", "resourceTypes", "technologyTypes"
    FROM "CourseSpecTeachingLearning"
    WHERE "courseSpecId" = ${courseSpecId}
    LIMIT 1
  `);
  if (profiles[0]) {
    const ready = teachingLearningIsReady(profiles[0], items);
    await tx.courseSpecSection.upsert({
      where: { courseSpecId_sectionKey: { courseSpecId, sectionKey: "teachingLearning" } },
      create: { courseSpecId, sectionKey: "teachingLearning", status: ready ? "Complete" : "Draft" },
      update: { status: ready ? "Complete" : "Draft" },
    });
  }
}

async function syncWeeklyPlan(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  weeks: WeeklyPlanSection["weeks"],
) {
  await tx.courseSpecWeek.deleteMany({ where: { courseSpecId } });
  if (!weeks.length) return;
  await tx.courseSpecWeek.createMany({
    data: weeks.map((week, order) => ({
      id: week.id,
      courseSpecId,
      order,
      week: week.week,
      topic: week.topic,
      cloCodes: week.cloCodes,
      lloItems: week.lloItems,
      lessonLearningOutcomes: week.lessonLearningOutcomes,
      activities: week.activities,
      studentLearningActivities: week.studentLearningActivities,
      lectureHours: week.lectureHours ?? null,
      tutorialHours: week.tutorialHours ?? null,
      practiceHours: week.practiceHours ?? null,
      otherHours: week.otherHours ?? null,
      selfStudyHours: week.selfStudyHours ?? null,
      teachingMethodIds: week.teachingMethodIds,
      teachingResourceTypes: week.teachingResourceTypes,
      assessmentMethodIds: week.assessmentMethodIds,
      assessment: week.assessment,
    })),
  });
}

async function syncAssessmentPlan(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  items: AssessmentPlanSection["items"],
) {
  await tx.courseSpecAssessmentItem.deleteMany({ where: { courseSpecId } });
  if (!items.length) return;

  await tx.courseSpecAssessmentItem.createMany({
    data: items.map((item, order) => ({
      id: item.id,
      courseSpecId,
      order,
      name: item.name,
      type: item.type,
      description: item.description,
      mode: item.mode === "group" ? ("Group" as const) : ("Individual" as const),
      status: item.status === "inactive" ? ("Inactive" as const) : ("Active" as const),
      cloCodes: item.cloCodes,
      weight: item.weight ?? null,
      dueWeek: item.dueWeek ?? null,
      durationWeeks: item.durationWeeks ?? null,
      format: item.format,
      submissionMethod: item.submissionMethod,
      instructions: item.instructions,
      rubric: item.rubric,
      feedbackMethod: item.feedbackMethod,
      feedbackTimeline: item.feedbackTimeline,
      mappedPlos: item.mappedPlos,
      notes: item.notes,
    })),
  });

  for (const item of items) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "CourseSpecAssessmentItem"
      SET
        "assessmentCategory" = ${item.assessmentCategory},
        "topicNumbers" = ${item.topicNumbers}::integer[],
        "physicalHours" = ${item.physicalHours ?? null},
        "onlineHours" = ${item.onlineHours ?? null},
        "independentHours" = ${item.independentHours ?? null}
      WHERE "courseSpecId" = ${courseSpecId} AND "id" = ${item.id}
    `);
  }
}

async function syncMappingCells(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  cells: MappingSection["cells"],
) {
  await tx.courseSpecMappingCell.deleteMany({ where: { courseSpecId } });
  if (!cells.length) return;
  await tx.courseSpecMappingCell.createMany({
    data: cells.map((cell) => ({
      courseSpecId,
      cloCode: cell.cloCode,
      kind: cell.kind === "assessment" ? ("Assessment" as const) : ("Week" as const),
      ref: cell.ref,
      strength: cell.strength,
    })),
    skipDuplicates: true,
  });
}

async function syncResources(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  resources: ResourcesSection["items"],
) {
  const evidenceWeekIds = [...new Set(resources.flatMap((resource) => resource.evidenceWeekIds))];
  if (evidenceWeekIds.length) {
    const weeks = await tx.courseSpecWeek.findMany({
      where: { courseSpecId, id: { in: evidenceWeekIds } },
      select: { id: true },
    });
    const known = new Set(weeks.map((week) => week.id));
    if (evidenceWeekIds.some((weekId) => !known.has(weekId)))
      throw new ReferenceError(
        "Resource evidence references a week that does not belong to this course specification",
      );
  }

  await tx.courseSpecResource.deleteMany({ where: { courseSpecId } });
  if (!resources.length) return;
  await tx.courseSpecResource.createMany({
    data: resources.map((resource, order) => ({
      id: resource.id,
      courseSpecId,
      order,
      weekId: resource.evidenceWeekIds[0] ?? null,
      resourceType: resource.resourceType,
      title: resource.title,
      url: resource.url,
      notes: resource.notes,
      evidenceWeekIds: resource.evidenceWeekIds,
      kind: resource.kind,
      authors: resource.authors,
      publisher: resource.publisher,
      year: resource.year,
      isbn: resource.isbn,
      basedOn: resource.basedOn,
    })),
  });
}

async function syncStudentResponsibilities(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  section: StudentResponsibilitySection,
) {
  await tx.courseSpecStudentResponsibility.deleteMany({ where: { courseSpecId } });
  if (!section.items.length) return;
  await tx.courseSpecStudentResponsibility.createMany({
    data: section.items.map((item, order) => ({ id: item.id, courseSpecId, order, text: item.text.trim() })),
  });
}

async function syncPolicy(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  policy: PolicySection,
) {
  await tx.courseSpecPolicy.upsert({
    where: { courseSpecId },
    create: { courseSpecId, ...policy },
    update: { ...policy },
  });
}

async function buildCourseInfoPrefill(course: {
  id: string;
  title: string;
  code: string;
  description: string | null;
  credits: number | null;
  prerequisites: string | null;
  courseType: string | null;
  lecturerId: string | null;
}): Promise<CourseInfoSection> {
  const lecturer = course.lecturerId ? await lecturers().getById(course.lecturerId) : null;
  const offering = await prisma.offering.findFirst({
    where: { courseId: course.id },
    orderBy: { createdAt: "desc" },
  });
  return {
    courseTitle: course.title,
    courseCode: course.code,
    credits: course.credits,
    prerequisites: course.prerequisites ?? "",
    courseType: (course.courseType as CourseInfoSection["courseType"]) ?? null,
    description: course.description ?? "",
    instructorName: lecturer?.name ?? "",
    qualification: lecturer?.qualification ?? "",
    email: lecturer?.email ?? "",
    telephone: lecturer?.phone ?? "",
    otherLecturers: offering?.otherLecturers ?? "",
    semester: offering?.semester ?? null,
    programmeYear: offering?.programmeYear ?? null,
  };
}

export const courseService = {
  async list(query: ListCoursesQuery, lecturerScope?: string) {
    const searchFilter = query.search
      ? {
          OR: [
            { code: { contains: query.search, mode: "insensitive" as const } },
            { title: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {};
    const scopeFilter = lecturerScope ? await ownerScopeFilter(lecturerScope) : {};
    const courses = await prisma.course.findMany({
      where: { AND: [searchFilter, scopeFilter] },
      orderBy: { code: "asc" },
    });
    const lecturerById = await lecturerLookup();
    return courses.map((course) => withLecturer(course, lecturerById));
  },

  async listSpecProgress(lecturerScope?: string): Promise<CourseSpecProgress[]> {
    const scopeFilter = lecturerScope ? await ownerScopeFilter(lecturerScope) : {};
    const courses = await prisma.course.findMany({
      where: scopeFilter,
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        spec: { select: { sections: { select: { sectionKey: true, status: true } } } },
      },
    });
    return courses.map((course) => {
      const completedSectionIds = new Set(
        (course.spec?.sections ?? [])
          .filter(
            (section) =>
              section.status === "Complete" &&
              COMPLETABLE_SECTION_IDS.includes(section.sectionKey as SpecSectionId),
          )
          .map((section) => section.sectionKey as SpecSectionId),
      );
      const incompleteSections = COMPLETABLE_SPEC_SECTIONS.filter(
        (section) => !completedSectionIds.has(section.id),
      ).map((section) => ({ id: section.id, title: section.title }));
      return {
        courseId: course.id,
        code: course.code,
        title: course.title,
        completed: completedSectionIds.size,
        total: COMPLETABLE_SECTION_IDS.length,
        incompleteSections,
      };
    });
  },

  async lecturerCanAccess(courseId: string, lecturerId: string) {
    return (await offerings().courseIdsForLecturer(lecturerId)).includes(courseId);
  },

  getById(id: string) {
    return prisma.course.findUnique({ where: { id } });
  },

  async getDetailed(id: string) {
    const course = await prisma.course.findUnique({ where: { id } });
    return course ? withLecturer(course, await lecturerLookup()) : null;
  },

  async create(input: CreateCourseInput) {
    await assertLecturerExists(input.lecturerId);
    const course = await prisma.course.create({ data: { ...input, programmeId: DEFAULT_PROGRAMME_ID } });
    return withLecturer(course, await lecturerLookup());
  },

  async update(id: string, input: UpdateCourseInput) {
    await assertLecturerExists(input.lecturerId);
    const course = await prisma.course.update({ where: { id }, data: input });
    return withLecturer(course, await lecturerLookup());
  },

  async remove(id: string) {
    return prisma.course.delete({ where: { id } });
  },

  async getSpec(courseId: string) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return null;
    const spec = await prisma.courseSpec.findUnique({ where: { courseId }, include: SPEC_INCLUDE });
    const { data, status } = await reassembleSpec(spec);
    data.courseInfo = await buildCourseInfoPrefill(course);
    return { courseId, data, status, review: reviewEnvelope(spec) };
  },

  async submitSpec(courseId: string, submittedById: string, note: string) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");
    const spec = await prisma.courseSpec.findUnique({ where: { courseId }, include: SPEC_INCLUDE });
    if (!spec) throw new ReferenceError("Course specification has not been started");

    const savedComplete = (sectionId: SpecSectionId) =>
      spec.sections.some((saved) => saved.sectionKey === sectionId && saved.status === "Complete");
    const activeClos = spec.clos.filter((clo) => clo.status === "Active");
    const gaps: string[] = [];
    if (!savedComplete("courseInfo")) gaps.push("Course Information");
    if (!savedComplete("clos") || !activeClos.length || activeClos.some((clo) => !clo.mappedPlos.length))
      gaps.push("Course Learning Outcomes");
    if (!activeClos.length || activeClos.some((clo) => !clo.teachingMethods.length))
      gaps.push("Teaching & Learning");
    if (!savedComplete("assessmentPlan")) gaps.push("Assessment");
    if (!savedComplete("slt")) gaps.push("Weekly Plan");
    if (!savedComplete("responsibility")) gaps.push("Student Responsibility");
    if (gaps.length)
      throw new ReferenceError(`Complete all required sections before submitting: ${gaps.join(", ")}`);
    if (!["Draft", "ChangesRequested"].includes(spec.reviewStatus))
      throw new ReferenceError("This course specification is not ready for submission");

    const nextVersion = spec.submissionVersion + 1;
    const nextStatus = spec.reviewStatus === "ChangesRequested" ? "Resubmitted" : "Submitted";
    const updated = await prisma.courseSpec.update({
      where: { courseId },
      data: {
        reviewStatus: nextStatus,
        submissionVersion: nextVersion,
        submittedAt: new Date(),
        submittedById,
        submissionNote: note.trim(),
        reviewActions: {
          create: {
            submissionVersion: nextVersion,
            action: nextStatus === "Resubmitted" ? "Resubmitted" : "Submitted",
            actorId: submittedById,
            note: note.trim(),
          },
        },
      },
      include: SPEC_INCLUDE,
    });
    const { data, status } = await reassembleSpec(updated);
    data.courseInfo = await buildCourseInfoPrefill(course);
    return { courseId, data, status, review: reviewEnvelope(updated) };
  },

  async requestSpecChanges(courseId: string, reviewerId: string, note: string) {
    const trimmed = note.trim();
    if (!trimmed) throw new ReferenceError("A review comment is required when requesting changes");
    const spec = await prisma.courseSpec.findUnique({ where: { courseId } });
    if (!spec) throw new ReferenceError("Course specification has not been started");
    if (!["Submitted", "Resubmitted", "UnderReview"].includes(spec.reviewStatus))
      throw new ReferenceError("This course specification is not awaiting review");
    const updated = await prisma.courseSpec.update({
      where: { courseId },
      data: {
        reviewStatus: "ChangesRequested",
        reviewActions: {
          create: {
            submissionVersion: spec.submissionVersion,
            action: "ChangesRequested",
            actorId: reviewerId,
            note: trimmed,
          },
        },
      },
      include: SPEC_INCLUDE,
    });
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");
    const { data, status } = await reassembleSpec(updated);
    data.courseInfo = await buildCourseInfoPrefill(course);
    return { courseId, data, status, review: reviewEnvelope(updated) };
  },

  async approveSpec(courseId: string, reviewerId: string, note: string) {
    const spec = await prisma.courseSpec.findUnique({ where: { courseId } });
    if (!spec) throw new ReferenceError("Course specification has not been started");
    if (!["Submitted", "Resubmitted", "UnderReview"].includes(spec.reviewStatus))
      throw new ReferenceError("This course specification is not awaiting review");
    const updated = await prisma.courseSpec.update({
      where: { courseId },
      data: {
        reviewStatus: "Approved",
        reviewActions: {
          create: {
            submissionVersion: spec.submissionVersion,
            action: "Approved",
            actorId: reviewerId,
            note: note.trim(),
          },
        },
      },
      include: SPEC_INCLUDE,
    });
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");
    const { data, status } = await reassembleSpec(updated);
    data.courseInfo = await buildCourseInfoPrefill(course);
    return { courseId, data, status, review: reviewEnvelope(updated) };
  },

  async saveSection(courseId: string, sectionId: SpecSectionId, values: unknown) {
    let course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");
    if (sectionId === "courseInfo") {
      const info = values as CourseInfoInput;
      course = await prisma.course.update({
        where: { id: courseId },
        data: { prerequisites: info.prerequisites || null, description: info.description || null },
      });
    }

    await prisma.$transaction(async (tx) => {
      const spec = await tx.courseSpec.upsert({ where: { courseId }, create: { courseId }, update: {} });
      if (sectionId === "clos") await syncClos(tx, spec.id, (values as ClosSection).items);
      if (sectionId === "slt") await syncWeeklyPlan(tx, spec.id, (values as WeeklyPlanSection).weeks);
      if (sectionId === "assessmentPlan")
        await syncAssessmentPlan(tx, spec.id, (values as AssessmentPlanSection).items);
      if (sectionId === "mapping") await syncMappingCells(tx, spec.id, (values as MappingSection).cells);
      if (sectionId === "resources") await syncResources(tx, spec.id, (values as ResourcesSection).items);
      if (sectionId === "responsibility")
        await syncStudentResponsibilities(tx, spec.id, values as StudentResponsibilitySection);
      if (sectionId === "policy") await syncPolicy(tx, spec.id, values as PolicySection);
      if (!NORMALIZED_SECTIONS.has(sectionId))
        throw new Error(`Section "${sectionId}" has no normalized storage`);
      await tx.courseSpecSection.upsert({
        where: { courseSpecId_sectionKey: { courseSpecId: spec.id, sectionKey: sectionId } },
        create: { courseSpecId: spec.id, sectionKey: sectionId, status: "Complete" },
        update: { status: "Complete" },
      });
    });

    const spec = await prisma.courseSpec.findUnique({ where: { courseId }, include: SPEC_INCLUDE });
    const { data, status } = await reassembleSpec(spec);
    data.courseInfo = await buildCourseInfoPrefill(course);
    return { courseId, data, status, review: reviewEnvelope(spec) };
  },
} satisfies CoursesServiceContract & Record<string, unknown>;

export type CourseService = typeof courseService;
