import {
  COMPLETABLE_SPEC_SECTIONS,
  type ClosSection,
  type CourseInfoInput,
  type CourseInfoSection,
  type CourseSpecProgress,
  type CoursesServiceContract,
  type CreateCourseInput,
  type LecturerRef,
  type LecturersServiceContract,
  type ListCoursesQuery,
  type OfferingsServiceContract,
  type SpecSectionId,
  type UpdateCourseInput,
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

async function assertLecturerExists(lecturerId: string | null | undefined): Promise<void> {
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
function withLecturer<T extends { lecturerId: string | null }>(course: T, lecturerById: Map<string, LecturerRef>) {
  const lecturer = course.lecturerId ? (lecturerById.get(course.lecturerId) ?? null) : null;
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
    const scopeFilter = lecturerScope ? await ownerScopeFilter(lecturerScope) : {};
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
   * way as `list()` for non-admin callers. Selects only each section's
   * key/status, not its `content`, since that's all this needs.
   */
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
      const sections = course.spec?.sections ?? [];
      const completed = sections.filter(
        (s) => s.status === "Complete" && COMPLETABLE_SECTION_IDS.includes(s.sectionKey as SpecSectionId),
      ).length;
      return {
        courseId: course.id,
        code: course.code,
        title: course.title,
        completed,
        total: COMPLETABLE_SECTION_IDS.length,
      };
    });
  },

  /**
   * May the given lecturer see/edit this course? True only when they were
   * offered it (assigned to teach an Offering of it) — backs the router's
   * per-course access guard.
   */
  async lecturerCanAccess(courseId: string, lecturerId: string): Promise<boolean> {
    return (await offerings().courseIdsForLecturer(lecturerId)).includes(courseId);
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

    const spec = await prisma.courseSpec.findUnique({ where: { courseId }, include: SPEC_INCLUDE });
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
  async saveSection(courseId: string, sectionId: SpecSectionId, values: unknown) {
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
      const spec = await tx.courseSpec.upsert({ where: { courseId }, create: { courseId }, update: {} });

      if (sectionId === "clos") await syncClos(tx, spec.id, (values as ClosSection).items);

      const content = sectionId === "clos" || sectionId === "courseInfo" ? {} : (values as Prisma.InputJsonValue);
      await tx.courseSpecSection.upsert({
        where: { courseSpecId_sectionKey: { courseSpecId: spec.id, sectionKey: sectionId } },
        create: { courseSpecId: spec.id, sectionKey: sectionId, content, status: "Complete" },
        update: { content, status: "Complete" },
      });
    });

    const spec = await prisma.courseSpec.findUnique({ where: { courseId }, include: SPEC_INCLUDE });
    const { data, status } = reassembleSpec(spec);
    data.courseInfo = await buildCourseInfoPrefill(course);
    return { courseId, data, status };
  },
} satisfies CoursesServiceContract & Record<string, unknown>;

/** Shared `include` shape for reading a CourseSpec back out via `reassembleSpec`. */
const SPEC_INCLUDE = {
  sections: true,
  clos: { include: { teachingMethods: true, assessmentMethods: true }, orderBy: { order: "asc" as const } },
} satisfies Prisma.CourseSpecInclude;

type SpecRow = Prisma.CourseSpecGetPayload<{ include: typeof SPEC_INCLUDE }>;

/**
 * Reassemble the flat `{data, status}` envelope the API has always returned
 * (issue #81 changed storage, not the contract) from the normalized
 * CourseSpecSection/CourseSpecClo rows. Caller still needs to overlay a live
 * `data.courseInfo` afterwards.
 */
function reassembleSpec(spec: SpecRow | null): { data: Record<string, unknown>; status: Record<string, string> } {
  const data: Record<string, unknown> = {};
  const status: Record<string, string> = {};
  if (!spec) return { data, status };

  for (const section of spec.sections) {
    status[section.sectionKey] = section.status === "Complete" ? "complete" : "draft";
    if (section.sectionKey !== "clos") data[section.sectionKey] = section.content;
  }
  if (spec.sections.some((s) => s.sectionKey === "clos")) {
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
        assessmentMethodIds: clo.assessmentMethods.map((a) => a.assessmentMethodId),
        status: clo.status === "Inactive" ? "inactive" : "active",
        notes: clo.notes,
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
async function syncClos(tx: Prisma.TransactionClient, courseSpecId: string, items: ClosSection["items"]) {
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
  }));
  if (cloRows.length > 0) await tx.courseSpecClo.createMany({ data: cloRows });

  const teachingRows = items.flatMap((item) =>
    item.teachingMethodIds.map((teachingMethodId) => ({ courseSpecId, cloId: item.id, teachingMethodId })),
  );
  if (teachingRows.length > 0) await tx.courseSpecCloTeachingMethod.createMany({ data: teachingRows });

  const assessmentRows = items.flatMap((item) =>
    item.assessmentMethodIds.map((assessmentMethodId) => ({ courseSpecId, cloId: item.id, assessmentMethodId })),
  );
  if (assessmentRows.length > 0) await tx.courseSpecCloAssessmentMethod.createMany({ data: assessmentRows });
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

export type CourseService = typeof courseService;
