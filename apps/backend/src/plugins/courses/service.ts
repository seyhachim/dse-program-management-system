import {
  COMPLETABLE_SPEC_SECTIONS,
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
  type OfferingsServiceContract,
  type SpecSectionId,
  type UpdateCourseInput,
  type WeeklyPlanSection,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

/**
 * Courses business logic. The lecturer relationship is validated through the
 * registry (registry.get('lecturers')) rather than by importing the lecturers
 * plugin — the in-process equivalent of calling its API.
 */

/** Thrown when an input references something that doesn't exist. */
export class ReferenceError extends Error {}

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
    const courses = await prisma.course.findMany({
      where: scopeFilter,
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        spec: {
          select: { sections: { select: { sectionKey: true, status: true } } },
        },
      },
    });
    return courses.map((course) => {
      const sections = course.spec?.sections ?? [];
      const completed = sections.filter(
        (s) =>
          s.status === "Complete" &&
          COMPLETABLE_SECTION_IDS.includes(s.sectionKey as SpecSectionId),
      ).length;
      return {
        courseId: course.id,
        code: course.code,
        title: course.title,
        completed: COMPLETABLE_SECTION_IDS.length - incompleteSections.length,
        total: COMPLETABLE_SECTION_IDS.length,
        incompleteSections,
      };
    });
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

  async getDetailed(id: string) {
    const course = await prisma.course.findUnique({ where: { id } });
    return course ? withLecturer(course, await lecturerLookup()) : null;
  },

  async create(input: CreateCourseInput) {
    await assertLecturerExists(input.lecturerId);
    const course = await prisma.course.create({ data: input });
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
   * Return the full spec document for a course. Course Information (§1–13) is
   * always recomputed live from the current course + assigned lecturer + latest
   * offering — never read back from storage — so reassigning a lecturer or
   * editing the course elsewhere is reflected immediately instead of showing a
   * stale snapshot from whenever the section was last saved.
   */
  async getSpec(courseId: string) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return null;

    const spec = await prisma.courseSpec.findUnique({
      where: { courseId },
      include: SPEC_INCLUDE,
    });
    const { data, status } = reassembleSpec(spec);
    data.courseInfo = await buildCourseInfoPrefill(course);
    return { courseId, data, status };
  },

  /**
   * Upsert one section of the spec, marking it complete. For the Course
   * Information section, `values` is already restricted by `CourseInfoInput` to
   * Pre-requisites/Description — every other §1–13 field is admin/assignment-
   * derived (see `getSpec`) and isn't accepted here, so it's mirrored onto the
   * Course row rather than stored as a section snapshot; nothing is written to
   * `data.courseInfo`, since `getSpec` recomputes it fresh on every read. `clos`
   * additionally rebuilds the normalized CourseSpecClo rows (issue #81) instead
   * of storing its content as section JSON — every other section is a plain
   * upsert of its own CourseSpecSection row, isolated from every other section's
   * `updatedAt`/content.
   */
  async saveSection(
    courseId: string,
    sectionId: SpecSectionId,
    values: unknown,
  ) {
    let course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");

    if (sectionId === "courseInfo") {
      const info = values as CourseInfoInput;
      course = await prisma.course.update({
        where: { id: courseId },
        data: {
          prerequisites: info.prerequisites || null,
          description: info.description || null,
        },
      });
    }

    await prisma.$transaction(async (tx) => {
      const spec = await tx.courseSpec.upsert({
        where: { courseId },
        create: { courseId },
        update: {},
      });

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

    const spec = await prisma.courseSpec.findUnique({
      where: { courseId },
      include: SPEC_INCLUDE,
    });
    const { data, status } = reassembleSpec(spec);
    data.courseInfo = await buildCourseInfoPrefill(course);
    return { courseId, data, status };
  },
} satisfies CoursesServiceContract & Record<string, unknown>;

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
]);

/** Shared `include` shape for reading a CourseSpec back out via `reassembleSpec`. */
const SPEC_INCLUDE = {
  sections: true,
  clos: {
    include: { teachingMethods: true, assessmentMethods: true },
    orderBy: { order: "asc" as const },
  },
  weeks: { orderBy: { order: "asc" as const } },
  assessmentItems: { orderBy: { order: "asc" as const } },
  mappingCells: true,
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
        bloomLevel: item.bloomLevel,
        weight: item.weight,
        dueWeek: item.dueWeek,
        durationWeeks: item.durationWeeks,
        format: item.format,
        submissionMethod: item.submissionMethod,
        instructions: item.instructions,
        rubric: item.rubric,
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
      assessmentMethodIds: w.assessmentMethodIds,
      assessment: w.assessment,
    })),
  });
}

/** Delete-and-rebuild CourseSpecAssessmentItem rows for an `assessmentPlan` (§17) section save. */
async function syncAssessmentPlan(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  items: AssessmentPlanSection["items"],
) {
  await tx.courseSpecAssessmentItem.deleteMany({ where: { courseSpecId } });
  if (items.length === 0) return;
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
      bloomLevel: item.bloomLevel ?? null,
      weight: item.weight ?? null,
      dueWeek: item.dueWeek ?? null,
      durationWeeks: item.durationWeeks ?? null,
      format: item.format,
      submissionMethod: item.submissionMethod,
      instructions: item.instructions,
      rubric: item.rubric,
      mappedPlos: item.mappedPlos,
      notes: item.notes,
    })),
  });
}

/** Delete-and-rebuild CourseSpecMappingCell rows for a `mapping` (CLO Alignment) section save. */
async function syncMappingCells(
  tx: Prisma.TransactionClient,
  courseSpecId: string,
  cells: MappingSection["cells"],
) {
  await tx.courseSpecMappingCell.deleteMany({ where: { courseSpecId } });
  if (cells.length === 0) return;
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
    // Unlike CourseSpecWeek/CourseSpecAssessmentItem (client-generated uuid ids —
    // collision-free by construction), this table's PK is a composite of
    // user-selected values (cloCode, kind, ref); a payload with a repeated triple
    // is plausible client state, not just historical data, so this needs the same
    // dedupe posture the migration's own backfill already takes (`ON CONFLICT DO
    // NOTHING`) rather than throwing a unique-violation on save.
    skipDuplicates: true,
  });
}

/** Assemble a Course Information (§1–13) snapshot from existing course-related data. */
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
  const lecturer = course.lecturerId
    ? await lecturers().getById(course.lecturerId)
    : null;
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

export type CourseService = typeof courseService;
