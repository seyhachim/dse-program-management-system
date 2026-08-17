import {
  coLecturerViolation,
  teachingPeriodViolation,
  type CoursesServiceContract,
  type CourseWeeklyContactHoursRef,
  type CreateOfferingInput,
  type EnrollInput,
  type LecturerRef,
  type LecturersServiceContract,
  type ListOfferingsQuery,
  type ListLecturerWorkloadQuery,
  type LecturerWorkloadSummary,
  type OfferingView,
  type StudentsServiceContract,
  type UpdateOfferingInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { summarizeLecturerWorkload } from "./workload.ts";

/**
 * Course Offerings — the architectural proof point. An offering owns only its own
 * tables (Offering, Enrollment, OfferingCoLecturer); every reference to a Course,
 * Lecturer or Student is resolved through the registry, never by importing those
 * plugins. Swap any of them out and this plugin keeps working as long as the
 * contract holds.
 */

export class ReferenceError extends Error {}
export class CapacityError extends Error {}

// Registry accessors — resolved lazily (registration happens at app boot).
const courses = () => registry.get<CoursesServiceContract>("courses").service;
const lecturers = () => registry.get<LecturersServiceContract>("lecturers").service;
const students = () => registry.get<StudentsServiceContract>("students").service;

async function assertApprovedCourseSpec(courseId: string, courseSpecId: string): Promise<void> {
  const spec = await courses().getCourseSpecVersion(courseSpecId);
  if (!spec) throw new ReferenceError("CourseSpec version does not exist");
  if (spec.courseId !== courseId) throw new ReferenceError("CourseSpec version belongs to another course");
  if (spec.reviewStatus !== "Approved") throw new ReferenceError("Only an Approved CourseSpec version can be assigned to an offering");
}

async function assertLecturersExist(lecturerIds: string[]): Promise<void> {
  const found = await Promise.all(lecturerIds.map((id) => lecturers().getById(id)));
  if (found.some((l) => l === null)) throw new ReferenceError("One or more co-lecturers do not exist");
}

/** Fetch the lecturer lookup map once for a batch of `toView` calls. */
async function lecturerLookup(): Promise<Map<string, LecturerRef>> {
  const lecturerList = await lecturers().list();
  return new Map(lecturerList.map((l) => [l.id, l]));
}

const withRelations = {
  enrollments: { select: { studentId: true } },
  coLecturers: { select: { lecturerId: true } },
  meetings: true,
} as const;

function meetingDurationHours(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number) as [number, number];
  const [endHour, endMinute] = endTime.split(":").map(Number) as [number, number];
  return ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

/**
 * Assemble an enriched OfferingView by joining across plugins via the registry.
 * `lecturerById` is looked up once by the caller (not per offering row) so that
 * listing N offerings doesn't re-fetch the whole lecturers table N times.
 */
async function toView(
  offering: {
    id: string;
    courseId: string;
    courseSpecId: string | null;
    lecturerId: string | null;
    term: string;
    sectionCode: string;
    capacity: number;
    status: OfferingView["status"];
    semester: OfferingView["semester"];
    programmeYear: number | null;
    startDate: Date | null;
    endDate: Date | null;
    otherLecturers: string | null;
    createdAt: Date;
    enrollments: { studentId: string }[];
    coLecturers: { lecturerId: string }[];
    meetings: {
      id: string;
      dayOfWeek: string;
      startTime: string;
      endTime: string;
      room: string | null;
      activityType: string;
    }[];
  },
  lecturerById: Map<string, LecturerRef>,
): Promise<OfferingView> {
  const [course, courseSpec, enrolledStudents] = await Promise.all([
    courses().getById(offering.courseId),
    offering.courseSpecId ? courses().getCourseSpecVersion(offering.courseSpecId) : Promise.resolve(null),
    students().findByIds(offering.enrollments.map((e) => e.studentId)),
  ]);
  const lecturer = offering.lecturerId ? (lecturerById.get(offering.lecturerId) ?? null) : null;
  const coLecturers = offering.coLecturers
    .map((c) => lecturerById.get(c.lecturerId))
    .filter((l): l is LecturerRef => l != null);

  return {
    id: offering.id,
    term: offering.term,
    sectionCode: offering.sectionCode,
    status: offering.status,
    capacity: offering.capacity,
    semester: offering.semester,
    programmeYear: offering.programmeYear,
    startDate: dateOnly(offering.startDate),
    endDate: dateOnly(offering.endDate),
    otherLecturers: offering.otherLecturers,
    meetings: offering.meetings.map((meeting) => ({
      ...meeting,
      dayOfWeek: meeting.dayOfWeek as OfferingView["meetings"][number]["dayOfWeek"],
      activityType: meeting.activityType as OfferingView["meetings"][number]["activityType"],
      durationHours: meetingDurationHours(meeting.startTime, meeting.endTime),
    })),
    enrolledCount: offering.enrollments.length,
    createdAt: offering.createdAt.toISOString(),
    course: course
      ? { id: course.id, code: course.code, title: course.title, programmeId: course.programmeId }
      : null,
    courseSpec,
    // Full instructor block for the syllabus Course Details (§6–9).
    lecturer: lecturer
      ? {
          id: lecturer.id,
          name: lecturer.name,
          email: lecturer.email,
          title: lecturer.title,
          qualification: lecturer.qualification,
          phone: lecturer.phone,
        }
      : null,
    coLecturers,
    students: enrolledStudents.map((s) => ({ id: s.id, name: s.name, studentId: s.studentId })),
  };
}

export const offeringService = {
  /**
   * List offerings. When `lecturerScope` is given (the router passes it for
   * non-programme-wide callers — issue #104), results are restricted to
   * offerings where that lecturer is the primary lecturer or an assigned
   * co-lecturer. Mirrors `courseService.list`'s `lecturerScope` pattern.
   */
  async list(query: ListOfferingsQuery, lecturerScope?: string): Promise<OfferingView[]> {
    const offerings = await prisma.offering.findMany({
      where: {
        ...(query.term ? { term: { contains: query.term, mode: "insensitive" } } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(lecturerScope
          ? { OR: [{ lecturerId: lecturerScope }, { coLecturers: { some: { lecturerId: lecturerScope } } }] }
          : {}),
      },
      include: withRelations,
      orderBy: [{ term: "desc" }, { createdAt: "desc" }],
    });
    const lecturerById = await lecturerLookup();
    return Promise.all(offerings.map((o) => toView(o, lecturerById)));
  },

  async getById(id: string): Promise<OfferingView | null> {
    const offering = await prisma.offering.findUnique({ where: { id }, include: withRelations });
    return offering ? toView(offering, await lecturerLookup()) : null;
  },

  async create(input: CreateOfferingInput): Promise<OfferingView> {
    const { coLecturerIds, meetings, ...offeringInput } = input;
    // Validate cross-plugin references through the registry.
    if (!(await courses().getById(offeringInput.courseId))) {
      throw new ReferenceError("Course does not exist");
    }
    await assertApprovedCourseSpec(offeringInput.courseId, offeringInput.courseSpecId);
    if (offeringInput.lecturerId && !(await lecturers().getById(offeringInput.lecturerId))) {
      throw new ReferenceError("Assigned lecturer does not exist");
    }
    if (coLecturerIds?.length) await assertLecturersExist(coLecturerIds);
    const offering = await prisma.offering.create({
      data: {
        courseId: offeringInput.courseId,
        courseSpecId: offeringInput.courseSpecId,
        term: offeringInput.term,
        sectionCode: offeringInput.sectionCode,
        lecturerId: offeringInput.lecturerId ?? null,
        capacity: offeringInput.capacity,
        status: offeringInput.status,
        semester: offeringInput.semester ?? null,
        programmeYear: offeringInput.programmeYear ?? null,
        startDate: toDate(offeringInput.startDate),
        endDate: toDate(offeringInput.endDate),
        otherLecturers: offeringInput.otherLecturers ?? null,
        coLecturers: coLecturerIds?.length
          ? { create: coLecturerIds.map((lecturerId) => ({ lecturerId })) }
          : undefined,
        meetings: meetings.length
          ? {
              create: meetings.map((meeting) => ({
                ...meeting,
                room: meeting.room || null,
              })),
            }
          : undefined,
      },
      include: withRelations,
    });
    return toView(offering, await lecturerLookup());
  },

  async update(id: string, input: UpdateOfferingInput): Promise<OfferingView> {
    const { coLecturerIds, meetings, ...offeringInput } = input;
    if (offeringInput.lecturerId && !(await lecturers().getById(offeringInput.lecturerId))) {
      throw new ReferenceError("Assigned lecturer does not exist");
    }

    // Zod's superRefine only sees the fields in *this* request, so PATCHes need
    // co-lecturer and teaching-period invariants re-checked against final state.
    const existing = await prisma.offering.findUnique({
      where: { id },
      include: { coLecturers: { select: { lecturerId: true } } },
    });
    if (!existing) throw new ReferenceError("Offering not found");
    if (offeringInput.courseSpecId !== undefined) {
      await assertApprovedCourseSpec(existing.courseId, offeringInput.courseSpecId);
      if (existing.courseSpecId && offeringInput.courseSpecId !== existing.courseSpecId) {
        const [deadlineCount, resultCount] = await Promise.all([
          prisma.offeringAssessmentDeadline.count({ where: { offeringId: id } }),
          prisma.assessmentResult.count({ where: { enrollment: { offeringId: id } } }),
        ]);
        if (existing.status !== "Planned" || deadlineCount > 0 || resultCount > 0) {
          throw new ReferenceError("The bound CourseSpec version cannot change after delivery or academic data exists");
        }
      }
    }
    const nextLecturerId = offeringInput.lecturerId !== undefined ? offeringInput.lecturerId : existing.lecturerId;
    const nextCoLecturerIds =
      coLecturerIds !== undefined ? coLecturerIds : existing.coLecturers.map((c) => c.lecturerId);
    if (coLecturerViolation({ lecturerId: nextLecturerId, coLecturerIds: nextCoLecturerIds })) {
      throw new ReferenceError("The primary lecturer cannot also be a co-lecturer");
    }

    const nextStartDate =
      offeringInput.startDate !== undefined ? offeringInput.startDate : dateOnly(existing.startDate);
    const nextEndDate =
      offeringInput.endDate !== undefined ? offeringInput.endDate : dateOnly(existing.endDate);
    const periodViolation = teachingPeriodViolation({
      startDate: nextStartDate,
      endDate: nextEndDate,
    });
    if (periodViolation === "missingStart" || periodViolation === "missingEnd") {
      throw new ReferenceError("Teaching start and end dates must be set together");
    }
    if (periodViolation === "endBeforeStart") {
      throw new ReferenceError("Teaching end date must be on or after start date");
    }

    if (coLecturerIds?.length) await assertLecturersExist(coLecturerIds);

    const offering = await prisma.$transaction(async (tx) => {
      if (coLecturerIds !== undefined) {
        await tx.offeringCoLecturer.deleteMany({ where: { offeringId: id } });
        if (coLecturerIds.length) {
          await tx.offeringCoLecturer.createMany({
            data: coLecturerIds.map((lecturerId) => ({ offeringId: id, lecturerId })),
          });
        }
      }
      if (meetings !== undefined) {
        await tx.offeringMeeting.deleteMany({ where: { offeringId: id } });
        if (meetings.length) {
          await tx.offeringMeeting.createMany({
            data: meetings.map((meeting) => ({
              offeringId: id,
              ...meeting,
              room: meeting.room || null,
            })),
          });
        }
      }
      return tx.offering.update({
        where: { id },
        data: {
          ...(offeringInput.courseSpecId !== undefined ? { courseSpecId: offeringInput.courseSpecId } : {}),
          ...(offeringInput.term !== undefined ? { term: offeringInput.term } : {}),
          ...(offeringInput.sectionCode !== undefined
            ? { sectionCode: offeringInput.sectionCode }
            : {}),
          ...(offeringInput.lecturerId !== undefined ? { lecturerId: offeringInput.lecturerId } : {}),
          ...(offeringInput.capacity !== undefined ? { capacity: offeringInput.capacity } : {}),
          ...(offeringInput.status !== undefined ? { status: offeringInput.status } : {}),
          ...(offeringInput.semester !== undefined ? { semester: offeringInput.semester } : {}),
          ...(offeringInput.programmeYear !== undefined
            ? { programmeYear: offeringInput.programmeYear }
            : {}),
          ...(offeringInput.startDate !== undefined ? { startDate: toDate(offeringInput.startDate) } : {}),
          ...(offeringInput.endDate !== undefined ? { endDate: toDate(offeringInput.endDate) } : {}),
          ...(offeringInput.otherLecturers !== undefined
            ? { otherLecturers: offeringInput.otherLecturers }
            : {}),
        },
        include: withRelations,
      });
    });
    return toView(offering, await lecturerLookup());
  },

  async remove(id: string) {
    return prisma.offering.delete({ where: { id } });
  },

  // Cross-plugin (OfferingsServiceContract): the distinct courses a lecturer
  // teaches an offering of, as primary lecturer or co-lecturer (issue #79).
  // Courses uses this so teaching (or co-teaching) an offering of a course
  // grants access to that course, independent of Course.lecturerId.
  async courseIdsForLecturer(lecturerId: string): Promise<string[]> {
    const rows = await prisma.offering.findMany({
      where: { OR: [{ lecturerId }, { coLecturers: { some: { lecturerId } } }] },
      select: { courseId: true },
      distinct: ["courseId"],
    });
    return rows.map((r) => r.courseId);
  },

  /** Weekly teaching workload for the signed-in lecturer across assigned classes. */
  async workloadForLecturer(
    lecturerId: string,
    query: ListLecturerWorkloadQuery,
  ): Promise<LecturerWorkloadSummary> {
    const assignments = await prisma.offering.findMany({
      where: {
        ...(query.term ? { term: query.term } : {}),
        OR: [{ lecturerId }, { coLecturers: { some: { lecturerId } } }],
      },
      select: {
        id: true,
        courseId: true,
        courseSpecId: true,
        lecturerId: true,
        term: true,
        sectionCode: true,
        meetings: {
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            room: true,
            activityType: true,
          },
        },
      },
      orderBy: [{ term: "desc" }, { sectionCode: "asc" }],
    });

    const courseCache = new Map<
      string,
      Promise<{
        course: Awaited<ReturnType<CoursesServiceContract["getById"]>>;
        weeks: CourseWeeklyContactHoursRef[];
      }>
    >();
    const courseData = (courseId: string, courseSpecId: string | null) => {
      const key = `${courseId}:${courseSpecId ?? "unbound"}`;
      let cached = courseCache.get(key);
      if (!cached) {
        cached = Promise.all([
          courses().getById(courseId),
          courseSpecId ? courses().weeklyContactHours(courseSpecId) : Promise.resolve([]),
        ]).then(([course, weeks]) => ({ course, weeks }));
        courseCache.set(key, cached);
      }
      return cached;
    };

    const enriched = (
      await Promise.all(
        assignments.map(async (assignment) => {
          const { course, weeks } = await courseData(assignment.courseId, assignment.courseSpecId);
          return course
            ? {
                ...assignment,
                meetings: assignment.meetings.map((meeting) => ({
                  ...meeting,
                  dayOfWeek: meeting.dayOfWeek as OfferingView["meetings"][number]["dayOfWeek"],
                  activityType: meeting.activityType as OfferingView["meetings"][number]["activityType"],
                })),
                course,
                weeks,
              }
            : null;
        }),
      )
    ).filter((assignment): assignment is NonNullable<typeof assignment> => assignment !== null);

    return summarizeLecturerWorkload(lecturerId, enriched);
  },

  async enroll(id: string, input: EnrollInput): Promise<OfferingView> {
    const offering = await prisma.offering.findUnique({ where: { id }, include: withRelations });
    if (!offering) throw new ReferenceError("Offering not found");

    // Validate students exist via the registry.
    const found = await students().findByIds(input.studentIds);
    if (found.length !== input.studentIds.length) {
      throw new ReferenceError("One or more students do not exist");
    }

    // Capacity check against not-yet-enrolled students.
    const already = new Set(offering.enrollments.map((e) => e.studentId));
    const toAdd = input.studentIds.filter((sid) => !already.has(sid));
    if (offering.enrollments.length + toAdd.length > offering.capacity) {
      throw new CapacityError(
        `Capacity ${offering.capacity} exceeded (${offering.enrollments.length} enrolled, adding ${toAdd.length})`,
      );
    }

    await prisma.enrollment.createMany({
      data: toAdd.map((studentId) => ({ offeringId: id, studentId })),
      skipDuplicates: true,
    });
    return (await this.getById(id))!;
  },

  async unenroll(id: string, studentId: string): Promise<OfferingView> {
    await prisma.enrollment.deleteMany({ where: { offeringId: id, studentId } });
    const view = await this.getById(id);
    if (!view) throw new ReferenceError("Offering not found");
    return view;
  },
};

export type OfferingService = typeof offeringService;
