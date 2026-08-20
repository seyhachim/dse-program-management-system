import {
  COMPLETABLE_SPEC_SECTIONS,
  teachingLearningIsReady,
  type AssessmentPlanSection,
  type ClosSection,
  type CourseInfoInput,
  type CourseSpecVersionRef,
  type CourseInfoSection,
  type CourseSpecProgress,
  type CoursesServiceContract,
  type CreateCourseInput,
  type DateSection,
  type LecturerRef,
  type LecturersServiceContract,
  type ListCoursesQuery,
  type MappingSection,
  type PolicySection,
  type ReferencesSection,
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
import { rubricContentHash } from "../../core/academic/rubric-context.ts";
import { registry } from "../../core/plugins/registry.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { assertCourseSpecEditable } from "./spec-lock.ts";
import {
  buildCourseInfoSnapshot,
  courseInfoSnapshotData,
} from "./course-info-snapshot.ts";

/**
 * Courses business logic. The lecturer relationship is validated through the
 * registry (registry.get('lecturers')) rather than by importing the lecturers
 * plugin — the in-process equivalent of calling its API.
 */

/** Thrown when an input references something that doesn't exist. */
export class ReferenceError extends Error {}

export function validateAssessmentCloEvidence(
  items: Array<{ name: string; cloCodes: string[] }>,
  validCloCodes: ReadonlySet<string>,
) {
  for (const item of items) {
    if (new Set(item.cloCodes).size !== item.cloCodes.length) {
      throw new ReferenceError(`Assessment "${item.name}" contains a duplicate CLO mapping`);
    }
    const invalidCode = item.cloCodes.find((code) => !validCloCodes.has(code));
    if (invalidCode) {
      throw new ReferenceError(
        `Assessment "${item.name}" references ${invalidCode}, which does not belong to this course specification`,
      );
    }
  }
}

export function validateCriterionCloMappings(
  item: {
    name: string;
    rubricId: string | null;
    cloCodes: string[];
    criterionCloMappings: Array<{ criterionId: string; cloCodes: string[] }>;
  },
  validCloCodes: ReadonlySet<string>,
  validCriterionIds: ReadonlySet<string>,
) {
  if (item.criterionCloMappings.length === 0) return;
  if (!item.rubricId) {
    throw new ReferenceError(`Assessment "${item.name}" needs a linked rubric before criterion CLO evidence can be mapped`);
  }
  const assessmentCloCodes = new Set(item.cloCodes);
  const keys = new Set<string>();
  for (const mapping of item.criterionCloMappings) {
    if (!validCriterionIds.has(mapping.criterionId)) {
      throw new ReferenceError(`Assessment "${item.name}" references a rubric criterion that does not belong to its linked rubric`);
    }
    for (const cloCode of mapping.cloCodes) {
      if (!validCloCodes.has(cloCode)) {
        throw new ReferenceError(`Assessment "${item.name}" criterion evidence references ${cloCode}, which does not belong to this course specification`);
      }
      if (!assessmentCloCodes.has(cloCode)) {
        throw new ReferenceError(`Assessment "${item.name}" criterion evidence references ${cloCode}, which is not mapped at assessment level`);
      }
      const key = `${mapping.criterionId}:${cloCode}`;
      if (keys.has(key)) throw new ReferenceError(`Assessment "${item.name}" contains a duplicate criterion CLO mapping`);
      keys.add(key);
    }
  }
}

export function validateCourseSpecMappingEvidence(
  cells: Array<{ cloCode: string; kind: "assessment" | "week"; ref: string }>,
  validCloCodes: ReadonlySet<string>,
  weekIds: ReadonlySet<string>,
  assessmentIds: ReadonlySet<string>,
) {
  const keys = new Set<string>();
  for (const cell of cells) {
    if (!validCloCodes.has(cell.cloCode)) {
      throw new ReferenceError(
        `CLO mapping references ${cell.cloCode}, which does not belong to this course specification`,
      );
    }
    const validRef = cell.kind === "assessment"
      ? assessmentIds.has(cell.ref)
      : weekIds.has(cell.ref);
    if (!validRef) {
      throw new ReferenceError(
        `CLO mapping references an ${cell.kind} that does not belong to this course specification`,
      );
    }
    const key = `${cell.cloCode}:${cell.kind}:${cell.ref}`;
    if (keys.has(key)) {
      throw new ReferenceError("Duplicate CLO alignment mapping is not allowed");
    }
    keys.add(key);
  }
}

function lecturers(): LecturersServiceContract {
  return registry.get<LecturersServiceContract>("lecturers").service;
}

function offerings(): OfferingsServiceContract {
  return registry.get<OfferingsServiceContract>("offerings").service;
}

async function assertLecturerExists(
  lecturerId: string | null | undefined,
): Promise<void> {
  if (!lecturerId) return;
  const lecturer = await lecturers().getById(lecturerId);
  if (!lecturer) throw new ReferenceError("Assigned lecturer does not exist");
}

/** Fetch the lecturer lookup map once for a batch of `withLecturer` calls. */
async function lecturerLookup(): Promise<Map<string, LecturerRef>> {
  const lecturerList = await lecturers().list();
  return new Map(lecturerList.map((l) => [l.id, l]));
}

/**
 * Attach the lecturer summary to a course row for API responses. `lecturerById`
 * is looked up once by the caller (not per course row) so that listing N
 * courses doesn't issue N separate lecturer lookups.
 */
function withLecturer<T extends { lecturerId: string | null }>(
  course: T,
  lecturerById: Map<string, LecturerRef>,
) {
  const lecturer = course.lecturerId
    ? (lecturerById.get(course.lecturerId) ?? null)
    : null;
  return { ...course, lecturer };
}

/**
 * Courses a lecturer was actually offered — the non-admin list/dashboard scope.
 * Deliberately Offering-based only: `Course.lecturerId` is just the course
 * record's default/on-file lecturer and does not by itself grant visibility —
 * a lecturer must be assigned to a real Offering of the course to see it.
 */
async function ownerScopeFilter(lecturerScope: string) {
  return { id: { in: await offerings().courseIdsForLecturer(lecturerScope) } };
}

const COMPLETABLE_SECTION_IDS = COMPLETABLE_SPEC_SECTIONS.map((s) => s.id);
const CURRENT_SPEC_ORDER = [
  { versionMajor: "desc" as const },
  { versionMinor: "desc" as const },
];
const SPEC_PROGRESS_COURSE_SELECT = {
  id: true,
  code: true,
  title: true,
  specs: {
    orderBy: CURRENT_SPEC_ORDER,
    take: 1,
    select: { sections: { select: { sectionKey: true, status: true } } },
  },
} satisfies Prisma.CourseSelect;

type SpecProgressCourse = Prisma.CourseGetPayload<{
  select: typeof SPEC_PROGRESS_COURSE_SELECT;
}>;

function toCourseSpecProgress(course: SpecProgressCourse): CourseSpecProgress {
  const sections = course.specs[0]?.sections ?? [];

  const completedSectionIds = new Set(
    sections
      .filter(
        (section) =>
          section.status === "Complete" &&
          COMPLETABLE_SECTION_IDS.includes(section.sectionKey as SpecSectionId),
      )
      .map((section) => section.sectionKey as SpecSectionId),
  );

  const incompleteSections = COMPLETABLE_SPEC_SECTIONS.filter(
    (section) => !completedSectionIds.has(section.id),
  ).map((section) => ({
    id: section.id,
    title: section.title,
  }));

  return {
    courseId: course.id,
    code: course.code,
    title: course.title,
    completed: completedSectionIds.size,
    total: COMPLETABLE_SECTION_IDS.length,
    incompleteSections,
  };
}

async function listSpecProgressWhere(
  where: Prisma.CourseWhereInput,
): Promise<CourseSpecProgress[]> {
  const courses = await prisma.course.findMany({
    where,
    orderBy: { code: "asc" },
    select: SPEC_PROGRESS_COURSE_SELECT,
  });
  return courses.map(toCourseSpecProgress);
}

export function specProgressCourseFilter(
  courseIds: readonly string[],
): Prisma.CourseWhereInput {
  return { id: { in: [...new Set(courseIds)] } };
}

export async function listSpecProgressForCourseIds(
  courseIds: readonly string[],
): Promise<CourseSpecProgress[]> {
  if (courseIds.length === 0) return [];
  return listSpecProgressWhere(specProgressCourseFilter(courseIds));
}

function toCourseSpecVersionRef(spec: {
  id: string;
  courseId: string;
  versionMajor: number;
  versionMinor: number;
  reviewStatus: string;
  approvedAt: Date | null;
  effectiveFrom: Date | null;
}): CourseSpecVersionRef {
  return {
    id: spec.id,
    courseId: spec.courseId,
    versionMajor: spec.versionMajor,
    versionMinor: spec.versionMinor,
    version: `${spec.versionMajor}.${spec.versionMinor}`,
    reviewStatus: spec.reviewStatus,
    approvedAt: spec.approvedAt?.toISOString() ?? null,
    effectiveFrom: spec.effectiveFrom?.toISOString().slice(0, 10) ?? null,
  };
}

export const courseService = {
  /**
   * List courses. When `lecturerScope` is given, results are scoped to that
   * lecturer — the router passes it for non-admin callers. Scope = courses they
   * were offered (assigned to teach an Offering of), not merely on file as the
   * course's default lecturer.
   */
  async list(query: ListCoursesQuery, lecturerScope?: string) {
    const { search } = query;
    const searchFilter = search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" as const } },
            { title: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};
    const scopeFilter = lecturerScope
      ? await ownerScopeFilter(lecturerScope)
      : {};
    const courses = await prisma.course.findMany({
      where: { AND: [searchFilter, scopeFilter] },
      orderBy: { code: "asc" },
    });
    const lecturerById = await lecturerLookup();
    return courses.map((course) => withLecturer(course, lecturerById));
  },

  /**
   * Per-course count of completable spec sections marked complete — backs the
   * programme dashboard's Course Specification Progress view. Scoped the same
   * way as `list()` for non-admin callers. Selects only each section's key/status.
   */
  async listSpecProgress(
    lecturerScope?: string,
  ): Promise<CourseSpecProgress[]> {
    const scopeFilter = lecturerScope
      ? await ownerScopeFilter(lecturerScope)
      : {};
    return listSpecProgressWhere(scopeFilter);
  },

  /**
   * May the given lecturer see/edit this course? True only when they were
   * offered it (assigned to teach an Offering of it) — backs the router's
   * per-course access guard.
   */
  async lecturerCanAccess(
    courseId: string,
    lecturerId: string,
  ): Promise<boolean> {
    return (await offerings().courseIdsForLecturer(lecturerId)).includes(
      courseId,
    );
  },

  // Part of CoursesServiceContract — used by the offerings plugin via the registry.
  getById(id: string) {
    return prisma.course.findUnique({ where: { id } });
  },

  // Cross-plugin exact-version lookup used by Offerings.
  async getCourseSpecVersion(id: string): Promise<CourseSpecVersionRef | null> {
    const spec = await prisma.courseSpec.findUnique({
      where: { id },
      select: { id: true, courseId: true, versionMajor: true, versionMinor: true, reviewStatus: true, approvedAt: true, effectiveFrom: true },
    });
    return spec ? toCourseSpecVersionRef(spec) : null;
  },

  async listApprovedSpecVersions(courseId: string): Promise<CourseSpecVersionRef[]> {
    const specs = await prisma.courseSpec.findMany({
      where: { courseId, reviewStatus: "Approved" },
      orderBy: CURRENT_SPEC_ORDER,
      select: { id: true, courseId: true, versionMajor: true, versionMinor: true, reviewStatus: true, approvedAt: true, effectiveFrom: true },
    });
    return specs.map(toCourseSpecVersionRef);
  },

  // Part of CoursesServiceContract — workload must use the Offering's exact
  // bound CourseSpec, never whichever course version is newest today.
  async weeklyContactHours(courseSpecId: string) {
    const spec = await prisma.courseSpec.findUnique({
      where: { id: courseSpecId },
      select: {
        weeks: {
          orderBy: { order: "asc" },
          select: {
            week: true,
            lectureHours: true,
            tutorialHours: true,
            practiceHours: true,
            otherHours: true,
          },
        },
      },
    });
    return (spec?.weeks ?? []).map((week) => {
      const lectureHours = week.lectureHours ?? 0;
      const tutorialHours = week.tutorialHours ?? 0;
      const practiceHours = week.practiceHours ?? 0;
      const otherHours = week.otherHours ?? 0;
      return {
        week: week.week,
        lectureHours,
        tutorialHours,
        practiceHours,
        otherHours,
        totalContactHours: lectureHours + tutorialHours + practiceHours + otherHours,
      };
    });
  },

  async getDetailed(id: string) {
    const course = await prisma.course.findUnique({ where: { id } });
    return course ? withLecturer(course, await lecturerLookup()) : null;
  },

  async create(input: CreateCourseInput) {
    await assertLecturerExists(input.lecturerId);
    const course = await prisma.course.create({
      data: { ...input, programmeId: DEFAULT_PROGRAMME_ID },
    });
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

  /* ---------------------------------------------------- Course Specification */

  /**
   * Return the current academic CourseSpec version for a course. Once a version
   * exists, Course Information (§1–13) is read only from that version's snapshot
   * so later Course, lecturer, or Offering edits cannot rewrite historical output.
   * A course with no CourseSpec yet receives live values only as first-save prefill.
   */
  async getSpec(courseId: string) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return null;

    const spec = await prisma.courseSpec.findFirst({
      where: { courseId },
      orderBy: CURRENT_SPEC_ORDER,
      include: SPEC_INCLUDE,
    });
    const { data, status } = reassembleSpec(spec);
    if (!spec) data.courseInfo = await buildCourseInfoSnapshot(course);
    else if (!spec.courseInfo)
      throw new Error("Course specification Course Information snapshot is missing");
    return { courseId, data, status, review: reviewEnvelope(spec) };
  },

  async submitSpec(courseId: string, submittedById: string, note: string) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");

    const spec = await prisma.courseSpec.findFirst({
      where: { courseId },
      orderBy: CURRENT_SPEC_ORDER,
      include: SPEC_INCLUDE,
    });
    if (!spec)
      throw new ReferenceError("Course specification has not been started");

    const savedComplete = (sectionId: SpecSectionId) =>
      spec.sections.some(
        (saved) =>
          saved.sectionKey === sectionId && saved.status === "Complete",
      );

    const activeClos = spec.clos.filter((clo) => clo.status === "Active");
    const readinessGaps: string[] = [];

    if (!savedComplete("courseInfo")) readinessGaps.push("Course Information");

    if (
      !savedComplete("clos") ||
      activeClos.length === 0 ||
      activeClos.some((clo) => clo.mappedPlos.length === 0)
    ) {
      readinessGaps.push("Course Learning Outcomes");
    }

    if (
      activeClos.length === 0 ||
      activeClos.some((clo) => clo.teachingMethods.length === 0)
    ) {
      readinessGaps.push("Teaching & Learning");
    }

    if (!savedComplete("assessmentPlan")) readinessGaps.push("Assessment");
    if (!savedComplete("slt")) readinessGaps.push("Weekly Plan");
    if (!savedComplete("responsibility"))
      readinessGaps.push("Student Responsibility");

    if (readinessGaps.length > 0) {
      throw new ReferenceError(
        `Complete all required sections before submitting: ${readinessGaps.join(", ")}`,
      );
    }

    if (!["Draft", "ChangesRequested"].includes(spec.reviewStatus)) {
      throw new ReferenceError(
        "This course specification is not ready for submission",
      );
    }

    const nextVersion = spec.submissionVersion + 1;
    const nextStatus =
      spec.reviewStatus === "ChangesRequested" ? "Resubmitted" : "Submitted";
    const updated = await prisma.courseSpec.update({
      where: { id: spec.id },
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
    const { data, status } = reassembleSpec(updated);
    return { courseId, data, status, review: reviewEnvelope(updated) };
  },

  async requestSpecChanges(courseId: string, reviewerId: string, note: string) {
    const trimmedNote = note.trim();
    if (!trimmedNote)
      throw new ReferenceError(
        "A review comment is required when requesting changes",
      );

    const spec = await prisma.courseSpec.findFirst({ where: { courseId }, orderBy: CURRENT_SPEC_ORDER });
    if (!spec)
      throw new ReferenceError("Course specification has not been started");
    if (
      !["Submitted", "Resubmitted", "UnderReview"].includes(spec.reviewStatus)
    ) {
      throw new ReferenceError(
        "This course specification is not awaiting review",
      );
    }

    const updated = await prisma.courseSpec.update({
      where: { id: spec.id },
      data: {
        reviewStatus: "ChangesRequested",
        reviewActions: {
          create: {
            submissionVersion: spec.submissionVersion,
            action: "ChangesRequested",
            actorId: reviewerId,
            note: trimmedNote,
          },
        },
      },
      include: SPEC_INCLUDE,
    });

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");
    const { data, status } = reassembleSpec(updated);
    return { courseId, data, status, review: reviewEnvelope(updated) };
  },

  async approveSpec(courseId: string, reviewerId: string, note: string) {
    const spec = await prisma.courseSpec.findFirst({ where: { courseId }, orderBy: CURRENT_SPEC_ORDER });
    if (!spec)
      throw new ReferenceError("Course specification has not been started");
    if (
      !["Submitted", "Resubmitted", "UnderReview"].includes(spec.reviewStatus)
    ) {
      throw new ReferenceError(
        "This course specification is not awaiting review",
      );
    }

    const updated = await prisma.courseSpec.update({
      where: { id: spec.id },
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
    const { data, status } = reassembleSpec(updated);
    return { courseId, data, status, review: reviewEnvelope(updated) };
  },

  /**
   * Upsert one section of the spec, marking it complete. For Course Information,
   * `CourseInfoInput` intentionally permits only prerequisites/description. The
   * initial save captures all administrative §1–13 values into CourseSpecCourseInfo;
   * later draft edits update only those two permitted fields in both Course and
   * the active version snapshot. Other snapshot fields change only by creating a
   * new academic revision. `clos` additionally rebuilds normalized CourseSpecClo
   * rows; other sections keep their existing normalized storage behavior.
   */
  async saveSection(
    courseId: string,
    sectionId: SpecSectionId,
    values: unknown,
  ) {
    let course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");
    const initialCourseInfoSnapshot = await buildCourseInfoSnapshot(course);

    await prisma.$transaction(async (tx) => {
      const existingSpec = await tx.courseSpec.findFirst({
        where: { courseId },
        orderBy: CURRENT_SPEC_ORDER,
        select: { id: true, reviewStatus: true },
      });
      if (existingSpec) assertCourseSpecEditable(existingSpec.reviewStatus);

      const spec =
        existingSpec ??
        (await tx.courseSpec.create({
          data: {
            courseId,
            courseInfo: { create: courseInfoSnapshotData(initialCourseInfoSnapshot) },
          },
          select: { id: true, reviewStatus: true },
        }));

      if (sectionId === "courseInfo") {
        const info = values as CourseInfoInput;
        course = await tx.course.update({
          where: { id: courseId },
          data: {
            prerequisites: info.prerequisites || null,
            description: info.description || null,
          },
        });
        await tx.courseSpecCourseInfo.update({
          where: { courseSpecId: spec.id },
          data: {
            prerequisites: info.prerequisites ?? "",
            description: info.description ?? "",
          },
        });
      }

      if (sectionId === "clos")
        await syncClos(tx, spec.id, (values as ClosSection).items);
      if (sectionId === "slt")
        await syncWeeklyPlan(tx, spec.id, (values as WeeklyPlanSection).weeks);
      if (sectionId === "assessmentPlan")
        await syncAssessmentPlan(
          tx,
          spec.id,
          (values as AssessmentPlanSection).items,
        );
      if (sectionId === "mapping")
        await syncMappingCells(tx, spec.id, (values as MappingSection).cells);
      if (sectionId === "resources")
        await syncResources(tx, spec.id, (values as ResourcesSection).items);
      if (sectionId === "references")
        await syncReferences(tx, spec.id, (values as ReferencesSection).items);
      if (sectionId === "responsibility")
        await syncStudentResponsibilities(
          tx,
          spec.id,
          values as StudentResponsibilitySection,
        );
      if (sectionId === "policy")
        await syncPolicy(tx, spec.id, values as PolicySection);
      if (sectionId === "date") {
        const { date } = values as DateSection;
        await tx.courseSpec.update({
          where: { id: spec.id },
          data: { specDate: date ? new Date(`${date}T00:00:00.000Z`) : null },
        });
      }

      // Every saveable section must have a normalized table to write into — enforced,
      // not just documented, so a future section added to SPEC_SECTION_SCHEMAS without
      // one (and a NORMALIZED_SECTIONS entry) fails loudly here instead of silently
      // having nowhere to persist its payload (there's no `content` column to fall
      // back to since issue #103 phase C dropped it).
      if (!NORMALIZED_SECTIONS.has(sectionId)) {
        throw new Error(
          `Section "${sectionId}" has no normalized storage — add it to NORMALIZED_SECTIONS ` +
            `and a sync function/reassembleSpec case for it.`,
        );
      }
      await tx.courseSpecSection.upsert({
        where: {
          courseSpecId_sectionKey: {
            courseSpecId: spec.id,
            sectionKey: sectionId,
          },
        },
        create: {
          courseSpecId: spec.id,
          sectionKey: sectionId,
          status: "Complete",
        },
        update: { status: "Complete" },
      });
    });

    const spec = await prisma.courseSpec.findFirst({
      where: { courseId },
      orderBy: CURRENT_SPEC_ORDER,
      include: SPEC_INCLUDE,
    });
    const { data, status } = reassembleSpec(spec);
    return { courseId, data, status, review: reviewEnvelope(spec) };
  },
} satisfies CoursesServiceContract & Record<string, unknown>;

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

/**
 * Every saveable section — its payload lives entirely in its own normalized table
 * (issue #103 finished what #81 started for `clos`), never in `CourseSpecSection`
 * itself, which now exists only to track per-section save status. `reassembleSpec`
 * below rebuilds `data[key]` from the normalized rows.
 */
const NORMALIZED_SECTIONS = new Set<SpecSectionId>([
  "clos",
  "courseInfo",
  "slt",
  "assessmentPlan",
  "mapping",
  "resources",
  "references",
  "responsibility",
  "policy",
  "date",
]);

/** Shared `include` shape for reading a CourseSpec back out via `reassembleSpec`. */
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
  reviewActions: {
    orderBy: { createdAt: "desc" as const },
  },
  studentResponsibilities: { orderBy: { order: "asc" as const } },
  policy: true,
} satisfies Prisma.CourseSpecInclude;

type SpecRow = Prisma.CourseSpecGetPayload<{ include: typeof SPEC_INCLUDE }>;

/**
 * Reassemble the flat `{data, status}` envelope the API has always returned
 * (issue #81/#103 changed storage, not the contract) from the normalized
 * CourseSpecSection/CourseSpecClo/CourseSpecWeek/CourseSpecAssessmentItem/
 * CourseSpecMappingCell rows. Caller still needs to overlay a live `data.courseInfo`
 * afterwards. `data[key]` is only set when a `CourseSpecSection` row exists for that
 * key — same presence-guard the `clos` case has always used — so a section that was
 * never saved stays `undefined` (distinct from a saved-but-empty section, which
 * still comes back as e.g. `{ weeks: [] }`); the wizard depends on that distinction
 * to know whether a section was ever opened.
 */
function reassembleSpec(spec: SpecRow | null): {
  data: Record<string, unknown>;
  status: Record<string, string>;
} {
  const data: Record<string, unknown> = {};
  const status: Record<string, string> = {};
  if (!spec) return { data, status };

  for (const section of spec.sections) {
    status[section.sectionKey] =
      section.status === "Complete" ? "complete" : "draft";
  }
  const hasSection = (key: SpecSectionId) =>
    spec.sections.some((s) => s.sectionKey === key);

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
    } satisfies CourseInfoSection;
  }

  if (hasSection("clos")) {
    // `code` isn't stored — re-derived from `order` so it can't drift from the
    // one source of truth for CLO position (see CourseSpecClo's schema comment).
    data.clos = {
      items: spec.clos.map((clo) => ({
        id: clo.id,
        code: `CLO${clo.order + 1}`,
        description: clo.description,
        level: clo.level,
        mappedPlos: clo.mappedPlos,
        sltHours: clo.sltHours,
        teachingMethodIds: clo.teachingMethods.map((t) => t.teachingMethodId),
        activeLearningStrategyIds: clo.activeLearningStrategyIds,
        assessmentMethodIds: clo.assessmentMethods.map(
          (a) => a.assessmentMethodId,
        ),
        status: clo.status === "Inactive" ? "inactive" : "active",
        notes: clo.notes,
      })),
    };
  }
  if (hasSection("slt")) {
    data.slt = {
      weeks: spec.weeks.map((w) => ({
        id: w.id,
        week: w.week,
        topic: w.topic,
        cloCodes: w.cloCodes,
        lloItems: w.lloItems,
        lessonLearningOutcomes: w.lessonLearningOutcomes ?? [],
        activities: w.activities,
        studentLearningActivities: w.studentLearningActivities ?? [],
        lectureHours: w.lectureHours,
        tutorialHours: w.tutorialHours,
        practiceHours: w.practiceHours,
        otherHours: w.otherHours,
        selfStudyHours: w.selfStudyHours,
        teachingMethodIds: w.teachingMethodIds,
        teachingResourceTypes: w.teachingResourceTypes,
        assessmentMethodIds: w.assessmentMethodIds,
        assessment: w.assessment,
      })),
    };
  }
  if (hasSection("assessmentPlan")) {
    data.assessmentPlan = {
      items: spec.assessmentItems.map((item) => ({
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
        format: item.format,
        submissionMethod: item.submissionMethod,
        instructions: item.instructions,
        rubricId: item.rubricId,
        criterionCloMappings: Object.values(
          item.criterionCloMappings.reduce<Record<string, { criterionId: string; cloCodes: string[] }>>((acc, mapping) => {
            const row = acc[mapping.criterionId] ?? { criterionId: mapping.criterionId, cloCodes: [] };
            row.cloCodes.push(mapping.cloCode);
            acc[mapping.criterionId] = row;
            return acc;
          }, {}),
        ),
        feedbackMethod: item.feedbackMethod,
        feedbackTimeline: item.feedbackTimeline,
        mappedPlos: item.mappedPlos,
        notes: item.notes,
      })),
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
      items: spec.resources
        .filter((resource) => resource.section === "Resource")
        .map((resource) => ({
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
        })),
    };
  }
  if (hasSection("references")) {
    data.references = {
      items: spec.resources
        .filter((resource) => resource.section === "Reference")
        .map((resource) => ({
          id: resource.id,
          kind: resource.kind,
          title: resource.title,
          authors: resource.authors,
          publisher: resource.publisher,
          year: resource.year,
          isbn: resource.isbn,
          url: resource.url,
          basedOn: resource.basedOn,
          notes: resource.notes,
        })),
    };
  }
  if (hasSection("responsibility")) {
    data.responsibility = {
      items: spec.studentResponsibilities.map((item) => ({
        id: item.id,
        text: item.text,
      })),
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
  if (hasSection("date")) {
    data.date = {
      date: spec.specDate ? spec.specDate.toISOString().slice(0, 10) : null,
    };
  }
  return { data, status };
}

/**
 * Delete-and-rebuild CourseSpecClo + method-link rows for a `clos` section save,
 * mirroring rubrics/service.ts's `syncNormalizedRubricTables`. Explicit
 * `createMany` calls rather than nested writes, since CourseSpecClo's PK/FKs are
 * composite (`(courseSpecId, id)` — see its schema comment) and this keeps the
 * composite key values explicit instead of relying on Prisma to infer both parts
 * of a composite FK from a single nested-write relation.
 */
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
    status:
      item.status === "inactive" ? ("Inactive" as const) : ("Active" as const),
    notes: item.notes,
    activeLearningStrategyIds: item.activeLearningStrategyIds,
  }));
  if (cloRows.length > 0) await tx.courseSpecClo.createMany({ data: cloRows });

  const teachingRows = items.flatMap((item) =>
    item.teachingMethodIds.map((teachingMethodId) => ({
      courseSpecId,
      cloId: item.id,
      teachingMethodId,
    })),
  );
  if (teachingRows.length > 0)
    await tx.courseSpecCloTeachingMethod.createMany({ data: teachingRows });

  const assessmentRows = items.flatMap((item) =>
    item.assessmentMethodIds.map((assessmentMethodId) => ({
      courseSpecId,
      cloId: item.id,
      assessmentMethodId,
    })),
  );
  if (assessmentRows.length > 0)
    await tx.courseSpecCloAssessmentMethod.createMany({ data: assessmentRows });

  const profiles = await tx.$queryRaw<TeachingLearningProfile[]>(Prisma.sql`
    SELECT
      "philosophyTags",
      "philosophyStatement",
      "teachingMethodIds",
      "activeLearningStrategyIds",
      "independentLearningTypes",
      "resourceTypes",
      "technologyTypes"
    FROM "CourseSpecTeachingLearning"
    WHERE "courseSpecId" = ${courseSpecId}
    LIMIT 1
  `);
  const profile = profiles[0];
  if (profile) {
    const ready = teachingLearningIsReady(profile, items);
    await tx.courseSpecSection.upsert({
      where: {
        courseSpecId_sectionKey: { courseSpecId, sectionKey: "teachingLearning" },
      },
      create: {
        courseSpecId,
        sectionKey: "teachingLearning",
        status: ready ? "Complete" : "Draft",
      },
      update: { status: ready ? "Complete" : "Draft" },
    });
  }
}

/** Delete-and-rebuild CourseSpecWeek rows for an `slt` (§18 Weekly Plan) section save. */
async function syncWeeklyPlan(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  weeks: WeeklyPlanSection["weeks"],
) {
  await tx.courseSpecWeek.deleteMany({ where: { courseSpecId } });
  if (weeks.length === 0) return;
  await tx.courseSpecWeek.createMany({
    data: weeks.map((w, order) => ({
      id: w.id,
      courseSpecId,
      order,
      week: w.week,
      topic: w.topic,
      cloCodes: w.cloCodes,
      lloItems: w.lloItems,
      lessonLearningOutcomes: w.lessonLearningOutcomes,
      activities: w.activities,
      studentLearningActivities: w.studentLearningActivities,
      lectureHours: w.lectureHours ?? null,
      tutorialHours: w.tutorialHours ?? null,
      practiceHours: w.practiceHours ?? null,
      otherHours: w.otherHours ?? null,
      selfStudyHours: w.selfStudyHours ?? null,
      teachingMethodIds: w.teachingMethodIds,
      teachingResourceTypes: w.teachingResourceTypes,
      assessmentMethodIds: w.assessmentMethodIds,
      assessment: w.assessment,
    })),
  });
}

/**
 * Delete-and-rebuild CourseSpecAssessmentItem rows for an `assessmentPlan` (§17)
 * section save. CLO evidence references are validated against the current
 * CourseSpec before the existing rows are rebuilt. `rubricId` is reconciled
 * against real Rubric rows before writing (rather than letting the FK reject the
 * whole save) since the wizard already tolerates a stale/deleted rubric selection
 * as a valid state (issue #123).
 */
async function syncAssessmentPlan(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  items: AssessmentPlanSection["items"],
) {
  if (items.length === 0) {
    await tx.courseSpecAssessmentItem.deleteMany({ where: { courseSpecId } });
    return;
  }

  const clos = await tx.courseSpecClo.findMany({
    where: { courseSpecId },
    select: { order: true },
  });
  const validCloCodes = new Set(clos.map((clo) => `CLO${clo.order + 1}`));
  validateAssessmentCloEvidence(items, validCloCodes);

  const rubricIds = [...new Set(items.flatMap((item) => item.rubricId ? [item.rubricId] : []))];
  const rubrics = rubricIds.length
    ? await tx.rubric.findMany({
        where: { id: { in: rubricIds } },
        select: {
          id: true,
          levelRows: { select: { id: true, label: true, points: true, order: true } },
          criterionRows: { select: { id: true, name: true, order: true } },
        },
      })
    : [];
  const rubricById = new Map(rubrics.map((rubric) => [rubric.id, rubric]));
  const validRubricIds = new Set(rubrics.map((rubric) => rubric.id));
  for (const item of items) {
    const rubric = item.rubricId ? rubricById.get(item.rubricId) : undefined;
    validateCriterionCloMappings(
      item,
      validCloCodes,
      new Set(rubric?.criterionRows.map((criterion) => criterion.id) ?? []),
    );
  }

  await tx.courseSpecCriterionCloMapping.deleteMany({ where: { courseSpecId } });
  await tx.courseSpecAssessmentItem.deleteMany({ where: { courseSpecId } });
  await tx.courseSpecAssessmentItem.createMany({
    data: items.map((item, order) => ({
      id: item.id,
      courseSpecId,
      order,
      name: item.name,
      type: item.type,
      description: item.description,
      mode:
        item.mode === "group" ? ("Group" as const) : ("Individual" as const),
      status:
        item.status === "inactive"
          ? ("Inactive" as const)
          : ("Active" as const),
      cloCodes: item.cloCodes,
      weight: item.weight ?? null,
      dueWeek: item.dueWeek ?? null,
      durationWeeks: item.durationWeeks ?? null,
      format: item.format,
      submissionMethod: item.submissionMethod,
      instructions: item.instructions,
      rubricId:
        item.rubricId && validRubricIds.has(item.rubricId)
          ? item.rubricId
          : null,
      feedbackMethod: item.feedbackMethod,
      feedbackTimeline: item.feedbackTimeline,
      mappedPlos: item.mappedPlos,
      notes: item.notes,
    })),
  });

  const mappingRows = items.flatMap((item) => {
    if (!item.rubricId) return [];
    const rubric = rubricById.get(item.rubricId);
    if (!rubric) return [];
    const criterionById = new Map(rubric.criterionRows.map((criterion) => [criterion.id, criterion]));
    const contentHash = rubricContentHash(rubric);
    return item.criterionCloMappings.flatMap((mapping) => {
      const criterion = criterionById.get(mapping.criterionId);
      if (!criterion) return [];
      return mapping.cloCodes.map((cloCode) => ({
        courseSpecId,
        assessmentItemId: item.id,
        rubricId: item.rubricId!,
        criterionId: mapping.criterionId,
        criterionName: criterion.name,
        rubricContentHash: contentHash,
        cloCode,
      }));
    });
  });
  if (mappingRows.length > 0) {
    await tx.courseSpecCriterionCloMapping.createMany({ data: mappingRows });
  }
}

/**
 * Delete-and-rebuild CourseSpecResource rows for a `resources` (§19) section save.
 * Scoped to `section: "Resource"` — CourseSpecResource also backs §20 References
 * (`section: "Reference"`), and an unscoped delete here would wipe out that
 * section's rows on every §19 save.
 */
async function syncResources(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  resources: ResourcesSection["items"],
) {
  const evidenceWeekIds = [
    ...new Set(resources.flatMap((resource) => resource.evidenceWeekIds)),
  ];
  if (evidenceWeekIds.length > 0) {
    const weeks = await tx.courseSpecWeek.findMany({
      where: { courseSpecId, id: { in: evidenceWeekIds } },
      select: { id: true },
    });
    const knownWeekIds = new Set(weeks.map((week) => week.id));
    const invalidWeekId = evidenceWeekIds.find(
      (weekId) => !knownWeekIds.has(weekId),
    );
    if (invalidWeekId) {
      throw new ReferenceError(
        "Resource evidence references a week that does not belong to this course specification",
      );
    }
  }

  await tx.courseSpecResource.deleteMany({
    where: { courseSpecId, section: "Resource" },
  });
  if (resources.length === 0) return;

  await tx.courseSpecResource.createMany({
    data: resources.map((resource, order) => ({
      id: resource.id,
      courseSpecId,
      order,
      section: "Resource",
      weekId: resource.evidenceWeekIds[0] ?? null,
      resourceType: resource.resourceType,
      title: resource.title,
      url: resource.url,
      notes: resource.notes,
      evidenceWeekIds: resource.evidenceWeekIds,
    })),
  });
}

/**
 * Delete-and-rebuild CourseSpecResource rows for a `references` (§20) section
 * save, scoped to `section: "Reference"` — see {@link syncResources}. §20 has
 * no Weekly Plan evidence linkage, unlike §19.
 */
async function syncReferences(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  references: ReferencesSection["items"],
) {
  await tx.courseSpecResource.deleteMany({
    where: { courseSpecId, section: "Reference" },
  });
  if (references.length === 0) return;

  await tx.courseSpecResource.createMany({
    data: references.map((reference, order) => ({
      id: reference.id,
      courseSpecId,
      order,
      section: "Reference",
      resourceType: "",
      kind: reference.kind,
      title: reference.title,
      authors: reference.authors,
      publisher: reference.publisher,
      year: reference.year,
      isbn: reference.isbn,
      url: reference.url,
      basedOn: reference.basedOn,
      notes: reference.notes,
    })),
  });
}

async function syncStudentResponsibilities(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  section: StudentResponsibilitySection,
) {
  await tx.courseSpecStudentResponsibility.deleteMany({ where: { courseSpecId } });
  if (section.items.length === 0) return;
  await tx.courseSpecStudentResponsibility.createMany({
    data: section.items.map((item, order) => ({
      id: item.id,
      courseSpecId,
      order,
      text: item.text.trim(),
    })),
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

async function syncMappingCells(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  cells: MappingSection["cells"],
) {
  if (cells.length === 0) {
    await tx.courseSpecMappingCell.deleteMany({ where: { courseSpecId } });
    return;
  }

  const [clos, weeks, assessmentItems] = await Promise.all([
    tx.courseSpecClo.findMany({ where: { courseSpecId }, select: { order: true } }),
    tx.courseSpecWeek.findMany({ where: { courseSpecId }, select: { id: true } }),
    tx.courseSpecAssessmentItem.findMany({ where: { courseSpecId }, select: { id: true } }),
  ]);
  validateCourseSpecMappingEvidence(
    cells,
    new Set(clos.map((clo) => `CLO${clo.order + 1}`)),
    new Set(weeks.map((week) => week.id)),
    new Set(assessmentItems.map((assessment) => assessment.id)),
  );

  await tx.courseSpecMappingCell.deleteMany({ where: { courseSpecId } });
  await tx.courseSpecMappingCell.createMany({
    data: cells.map((cell) => ({
      courseSpecId,
      cloCode: cell.cloCode,
      kind:
        cell.kind === "assessment"
          ? ("Assessment" as const)
          : ("Week" as const),
      ref: cell.ref,
      strength: cell.strength,
    })),
  });
}

export type CourseService = typeof courseService;