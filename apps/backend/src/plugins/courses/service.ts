import {
  SPEC_SECTIONS,
  type CourseInfoSection,
  type CourseSpecProgress,
  type CoursesServiceContract,
  type CreateCourseInput,
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

/** Attach the lecturer summary to a course row for API responses. */
async function withLecturer<T extends { lecturerId: string | null }>(course: T) {
  const lecturer = course.lecturerId ? await lecturers().getById(course.lecturerId) : null;
  return { ...course, lecturer };
}

/** Courses a lecturer owns or teaches an offering of — the non-admin list/dashboard scope. */
async function ownerScopeFilter(lecturerScope: string) {
  return {
    OR: [
      { lecturerId: lecturerScope },
      { id: { in: await offerings().courseIdsForLecturer(lecturerScope) } },
    ],
  };
}

const READY_SECTION_IDS = SPEC_SECTIONS.filter((s) => s.state === "ready").map((s) => s.id);

export const courseService = {
  /**
   * List courses. When `lecturerScope` is given, results are scoped to that
   * lecturer — the router passes it for non-admin callers. Scope = courses they
   * own (Course.lecturerId) OR teach an offering of, so teaching an offering of a
   * course surfaces the course in Course Management too.
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
    return Promise.all(courses.map(withLecturer));
  },

  /**
   * Per-course count of "ready" spec sections marked complete — backs the
   * programme dashboard's Course Specification Progress view. Scoped the same
   * way as `list()` for non-admin callers.
   */
  async listSpecProgress(lecturerScope?: string): Promise<CourseSpecProgress[]> {
    const scopeFilter = lecturerScope ? await ownerScopeFilter(lecturerScope) : {};
    const courses = await prisma.course.findMany({
      where: scopeFilter,
      orderBy: { code: "asc" },
      include: { spec: true },
    });
    return courses.map((course) => {
      const status = (course.spec?.status as Record<string, string>) ?? {};
      const completed = READY_SECTION_IDS.filter((id) => status[id] === "complete").length;
      return { courseId: course.id, code: course.code, title: course.title, completed, total: READY_SECTION_IDS.length };
    });
  },

  /**
   * May the given lecturer see/edit this course? True when they own it or teach
   * an offering of it. Backs the router's per-course access guard.
   */
  async lecturerCanAccess(courseId: string, lecturerId: string): Promise<boolean> {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { lecturerId: true },
    });
    if (!course) return false;
    if (course.lecturerId === lecturerId) return true;
    return (await offerings().courseIdsForLecturer(lecturerId)).includes(courseId);
  },

  // Part of CoursesServiceContract — used by the offerings plugin via the registry.
  getById(id: string) {
    return prisma.course.findUnique({ where: { id } });
  },

  async getDetailed(id: string) {
    const course = await prisma.course.findUnique({ where: { id } });
    return course ? withLecturer(course) : null;
  },

  async create(input: CreateCourseInput) {
    await assertLecturerExists(input.lecturerId);
    const course = await prisma.course.create({ data: input });
    return withLecturer(course);
  },

  async update(id: string, input: UpdateCourseInput) {
    await assertLecturerExists(input.lecturerId);
    const course = await prisma.course.update({ where: { id }, data: input });
    return withLecturer(course);
  },

  async remove(id: string) {
    return prisma.course.delete({ where: { id } });
  },

  /* ---------------------------------------------------- Course Specification */

  /**
   * Return the full spec document for a course. If the Course Information section
   * hasn't been saved yet, it is pre-filled (in memory, not persisted) from the
   * existing course + lecturer + latest offering so the wizard opens populated.
   */
  async getSpec(courseId: string) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return null;

    const spec = await prisma.courseSpec.findUnique({ where: { courseId } });
    const data = { ...((spec?.data as Record<string, unknown>) ?? {}) };
    const status = { ...((spec?.status as Record<string, string>) ?? {}) };

    if (!data.courseInfo) {
      data.courseInfo = await buildCourseInfoPrefill(course);
    }
    return { courseId, data, status };
  },

  /**
   * Upsert one section of the spec, marking it complete. For the Course Information
   * section, the overlapping scalars are mirrored back onto the Course row so the
   * courses list stays accurate.
   */
  async saveSection(courseId: string, sectionId: SpecSectionId, values: unknown) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new ReferenceError("Course not found");

    if (sectionId === "courseInfo") {
      const info = values as CourseInfoSection;
      await prisma.course.update({
        where: { id: courseId },
        data: {
          title: info.courseTitle,
          code: info.courseCode,
          description: info.description || null,
          credits: info.credits ?? null,
          prerequisites: info.prerequisites || null,
          courseType: info.courseType ?? null,
        },
      });
    }

    const existing = await prisma.courseSpec.findUnique({ where: { courseId } });
    const data = { ...((existing?.data as Record<string, unknown>) ?? {}), [sectionId]: values };
    const status = { ...((existing?.status as Record<string, string>) ?? {}), [sectionId]: "complete" };

    const jsonData = data as Prisma.InputJsonValue;
    const jsonStatus = status as Prisma.InputJsonValue;
    await prisma.courseSpec.upsert({
      where: { courseId },
      create: { courseId, data: jsonData, status: jsonStatus },
      update: { data: jsonData, status: jsonStatus },
    });
    return { courseId, data, status };
  },
} satisfies CoursesServiceContract & Record<string, unknown>;

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
