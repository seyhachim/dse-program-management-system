import {
  coLecturerViolation,
  type AcademicCalendarServiceContract,
  type CoursesServiceContract,
  type CreateCurriculumBoundOfferingInput,
  type LecturersServiceContract,
  type OfferingCurriculumBindingView,
  type OfferingCurriculumPlacementRef,
  type OfferingCurriculumServiceContract,
  type OfferingCurriculumVersionRef,
  type OfferingView,
  type Semester,
  type UpdateCurriculumBoundOfferingInput,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { offeringService } from "./service.ts";

export class CurriculumBoundOfferingReferenceError extends Error {}
export class CurriculumBoundOfferingConflictError extends Error {}

interface ProgrammeOfferingContextService {
  academicCalendar: AcademicCalendarServiceContract;
  offeringCurriculum: OfferingCurriculumServiceContract;
}

type BindingRow = {
  offeringId: string;
  curriculumCourseId: string;
  boundByUserId: string;
  boundAt: Date;
  updatedByUserId: string;
  updatedAt: Date;
};

const courses = () => registry.get<CoursesServiceContract>("courses").service;
const lecturers = () => registry.get<LecturersServiceContract>("lecturers").service;
const programme = () => registry.get<ProgrammeOfferingContextService>("programme").service;

async function assertApprovedCourseSpec(courseId: string, courseSpecId: string): Promise<void> {
  const spec = await courses().getCourseSpecVersion(courseSpecId);
  if (!spec) throw new CurriculumBoundOfferingReferenceError("CourseSpec version does not exist");
  if (spec.courseId !== courseId) {
    throw new CurriculumBoundOfferingReferenceError("CourseSpec version belongs to another course");
  }
  if (spec.reviewStatus !== "Approved") {
    throw new CurriculumBoundOfferingReferenceError("Only an Approved CourseSpec version can govern delivery");
  }
}

async function assertLecturersExist(lecturerIds: string[]): Promise<void> {
  const found = await Promise.all(lecturerIds.map((id) => lecturers().getById(id)));
  if (found.some((lecturer) => lecturer === null)) {
    throw new CurriculumBoundOfferingReferenceError("One or more lecturers do not exist");
  }
}

function assertPlacementMatches(
  placement: OfferingCurriculumPlacementRef,
  courseId: string,
  programmeYear: number,
  semester: Semester,
): void {
  if (placement.courseId !== courseId) {
    throw new CurriculumBoundOfferingReferenceError("The selected curriculum placement belongs to another course");
  }
  if (placement.yearLevel !== programmeYear || placement.semester !== semester) {
    throw new CurriculumBoundOfferingReferenceError(
      "The selected curriculum placement does not match the Offering study year and semester",
    );
  }
}

async function bindingRow(offeringId: string): Promise<BindingRow | null> {
  const rows = await prisma.$queryRaw<BindingRow[]>(Prisma.sql`
    SELECT
      "offeringId",
      "curriculumCourseId",
      "boundByUserId",
      "boundAt",
      "updatedByUserId",
      "updatedAt"
    FROM offering_governance."OfferingCurriculumBinding"
    WHERE "offeringId" = ${offeringId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function bindingView(
  offeringId: string,
  programmeId: string,
): Promise<OfferingCurriculumBindingView | null> {
  const row = await bindingRow(offeringId);
  if (!row) return null;
  const placement = await programme().offeringCurriculum.getPlacement(
    programmeId,
    row.curriculumCourseId,
  );
  if (!placement) {
    throw new CurriculumBoundOfferingReferenceError("Offering curriculum placement is no longer resolvable");
  }
  const version = await programme().offeringCurriculum.getVersion(
    programmeId,
    placement.curriculumVersionId,
  );
  if (!version) {
    throw new CurriculumBoundOfferingReferenceError("Offering curriculum version is no longer resolvable");
  }
  return {
    offeringId: row.offeringId,
    curriculumCourseId: row.curriculumCourseId,
    curriculumVersionId: placement.curriculumVersionId,
    boundByUserId: row.boundByUserId,
    boundAt: row.boundAt.toISOString(),
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt.toISOString(),
    version,
    placement,
  };
}

function requireView(view: OfferingView | null): OfferingView {
  if (!view) throw new CurriculumBoundOfferingReferenceError("Offering could not be reloaded after save");
  return view;
}

export const curriculumBoundOfferingService = {
  async listCurriculumVersions(programmeId: string): Promise<OfferingCurriculumVersionRef[]> {
    return programme().offeringCurriculum.listVersions(programmeId);
  },

  async listCurriculumPlacements(
    programmeId: string,
    curriculumVersionId: string,
    studyYear: number,
    semester: Semester,
  ): Promise<OfferingCurriculumPlacementRef[]> {
    return programme().offeringCurriculum.listPlacements(
      programmeId,
      curriculumVersionId,
      studyYear,
      semester,
    );
  },

  async getBinding(offeringId: string): Promise<OfferingCurriculumBindingView | null> {
    const offering = await offeringService.getById(offeringId);
    if (!offering?.course) return null;
    return bindingView(offeringId, offering.course.programmeId);
  },

  async create(
    input: CreateCurriculumBoundOfferingInput,
    actorId: string,
  ): Promise<OfferingView> {
    const offeringInput = input.offering;
    const course = await courses().getById(offeringInput.courseId);
    if (!course) throw new CurriculumBoundOfferingReferenceError("Course does not exist");
    if (!offeringInput.academicCalendarPeriodId || !offeringInput.programmeYear || !offeringInput.semester) {
      throw new CurriculumBoundOfferingReferenceError(
        "A published Academic Calendar period, study year, and semester are required",
      );
    }

    const [period, placement] = await Promise.all([
      programme().academicCalendar.getPublishedPeriodForOffering(
        offeringInput.academicCalendarPeriodId,
        course.programmeId,
        offeringInput.programmeYear,
      ),
      programme().offeringCurriculum.getPlacement(course.programmeId, input.curriculumCourseId),
    ]);
    if (!period) {
      throw new CurriculumBoundOfferingReferenceError(
        "The selected Academic Calendar period is not published for this programme and study year",
      );
    }
    if (!placement) {
      throw new CurriculumBoundOfferingReferenceError(
        "The selected curriculum placement is unavailable or still Draft",
      );
    }
    if (period.semester !== offeringInput.semester) {
      throw new CurriculumBoundOfferingReferenceError(
        "The selected semester does not match the published Academic Calendar period",
      );
    }
    assertPlacementMatches(
      placement,
      offeringInput.courseId,
      offeringInput.programmeYear,
      period.semester,
    );

    if (offeringInput.courseSpecId) {
      await assertApprovedCourseSpec(offeringInput.courseId, offeringInput.courseSpecId);
    }
    if (offeringInput.status !== "Planned" && !offeringInput.courseSpecId) {
      throw new CurriculumBoundOfferingReferenceError(
        "An Approved CourseSpec version is required before delivery can become active or completed",
      );
    }
    if (!offeringInput.lecturerId) {
      throw new CurriculumBoundOfferingReferenceError("A primary lecturer is required");
    }
    const lecturerIds = [offeringInput.lecturerId, ...(offeringInput.coLecturerIds ?? [])];
    await assertLecturersExist(lecturerIds);
    if (coLecturerViolation({
      lecturerId: offeringInput.lecturerId,
      coLecturerIds: offeringInput.coLecturerIds ?? [],
    })) {
      throw new CurriculumBoundOfferingReferenceError(
        "The primary lecturer cannot also be a co-lecturer",
      );
    }
    if (offeringInput.meetings.length === 0) {
      throw new CurriculumBoundOfferingReferenceError("Add at least one weekly class session");
    }

    try {
      const offeringId = await prisma.$transaction(async (tx) => {
        const created = await tx.offering.create({
          data: {
            courseId: offeringInput.courseId,
            courseSpecId: offeringInput.courseSpecId ?? null,
            term: `${period.academicYearLabel}-${period.semester === "First" ? "S1" : "S2"}`,
            sectionCode: offeringInput.sectionCode,
            lecturerId: offeringInput.lecturerId,
            capacity: offeringInput.capacity,
            status: offeringInput.status,
            semester: period.semester,
            programmeYear: offeringInput.programmeYear,
            academicCalendarPeriodId: period.id,
            startDate: null,
            endDate: null,
            otherLecturers: offeringInput.otherLecturers ?? null,
            coLecturers: offeringInput.coLecturerIds?.length
              ? { create: offeringInput.coLecturerIds.map((lecturerId) => ({ lecturerId })) }
              : undefined,
            meetings: {
              create: offeringInput.meetings.map((meeting) => ({
                ...meeting,
                room: meeting.room || null,
              })),
            },
          },
          select: { id: true },
        });
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO offering_governance."OfferingCurriculumBinding" (
            "offeringId",
            "curriculumCourseId",
            "boundByUserId",
            "updatedByUserId"
          ) VALUES (
            ${created.id},
            ${placement.id},
            ${actorId},
            ${actorId}
          )
        `);
        return created.id;
      });
      return requireView(await offeringService.getById(offeringId));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CurriculumBoundOfferingConflictError(
          "That course already has an Offering for this term and class",
        );
      }
      throw error;
    }
  },

  async update(
    offeringId: string,
    input: UpdateCurriculumBoundOfferingInput,
    actorId: string,
  ): Promise<OfferingView> {
    const existing = await prisma.offering.findUnique({
      where: { id: offeringId },
      include: { coLecturers: { select: { lecturerId: true } } },
    });
    if (!existing) throw new CurriculumBoundOfferingReferenceError("Offering not found");
    const course = await courses().getById(existing.courseId);
    if (!course) throw new CurriculumBoundOfferingReferenceError("Course does not exist");

    const binding = await bindingRow(offeringId);
    if (!binding) {
      throw new CurriculumBoundOfferingReferenceError(
        "This Offering has no pinned curriculum placement and must use the legacy edit flow",
      );
    }
    const placement = await programme().offeringCurriculum.getPlacement(
      course.programmeId,
      binding.curriculumCourseId,
    );
    if (!placement) {
      throw new CurriculumBoundOfferingReferenceError("Pinned curriculum placement is unavailable");
    }

    const patch = input.offering;
    const nextStatus = patch.status ?? existing.status;
    const nextCourseSpecId = patch.courseSpecId !== undefined ? patch.courseSpecId : existing.courseSpecId;
    const nextProgrammeYear = patch.programmeYear !== undefined ? patch.programmeYear : existing.programmeYear;
    const nextPeriodId = patch.academicCalendarPeriodId !== undefined
      ? patch.academicCalendarPeriodId
      : existing.academicCalendarPeriodId;

    if (existing.status === "Completed") {
      throw new CurriculumBoundOfferingReferenceError(
        "Completed Offering academic context is historical and cannot be edited",
      );
    }
    if (patch.startDate !== undefined || patch.endDate !== undefined) {
      throw new CurriculumBoundOfferingReferenceError(
        "Teaching dates for curriculum-bound Offerings come from the Academic Calendar",
      );
    }
    if (!nextProgrammeYear || !nextPeriodId) {
      throw new CurriculumBoundOfferingReferenceError(
        "A pinned Offering must keep a published Academic Calendar period and study year",
      );
    }

    const period = await programme().academicCalendar.getPublishedPeriodForOffering(
      nextPeriodId,
      course.programmeId,
      nextProgrammeYear,
    );
    if (!period) {
      throw new CurriculumBoundOfferingReferenceError(
        "The selected Academic Calendar period is not currently published for this programme and study year",
      );
    }
    if (patch.semester !== undefined && patch.semester !== period.semester) {
      throw new CurriculumBoundOfferingReferenceError(
        "The selected semester does not match the Academic Calendar period",
      );
    }
    assertPlacementMatches(placement, existing.courseId, nextProgrammeYear, period.semester);

    if (patch.courseSpecId === null && existing.courseSpecId) {
      throw new CurriculumBoundOfferingReferenceError("The bound Approved CourseSpec version cannot be removed");
    }
    if (patch.courseSpecId) {
      await assertApprovedCourseSpec(existing.courseId, patch.courseSpecId);
      if (existing.courseSpecId && patch.courseSpecId !== existing.courseSpecId) {
        const [deadlineCount, resultCount] = await Promise.all([
          prisma.offeringAssessmentDeadline.count({ where: { offeringId } }),
          prisma.assessmentResult.count({ where: { enrollment: { offeringId } } }),
        ]);
        if (existing.status !== "Planned" || deadlineCount > 0 || resultCount > 0) {
          throw new CurriculumBoundOfferingReferenceError(
            "The bound CourseSpec version cannot change after delivery or academic data exists",
          );
        }
      }
    }
    if (nextStatus !== "Planned" && !nextCourseSpecId) {
      throw new CurriculumBoundOfferingReferenceError(
        "An Approved CourseSpec version is required before delivery can become active or completed",
      );
    }
    if (nextCourseSpecId) await assertApprovedCourseSpec(existing.courseId, nextCourseSpecId);

    const nextLecturerId = patch.lecturerId !== undefined ? patch.lecturerId : existing.lecturerId;
    const nextCoLecturerIds = patch.coLecturerIds !== undefined
      ? patch.coLecturerIds
      : existing.coLecturers.map((row) => row.lecturerId);
    if (!nextLecturerId) throw new CurriculumBoundOfferingReferenceError("A primary lecturer is required");
    await assertLecturersExist([nextLecturerId, ...nextCoLecturerIds]);
    if (coLecturerViolation({ lecturerId: nextLecturerId, coLecturerIds: nextCoLecturerIds })) {
      throw new CurriculumBoundOfferingReferenceError(
        "The primary lecturer cannot also be a co-lecturer",
      );
    }
    if (patch.meetings !== undefined && patch.meetings.length === 0) {
      throw new CurriculumBoundOfferingReferenceError("Add at least one weekly class session");
    }

    await prisma.$transaction(async (tx) => {
      if (patch.coLecturerIds !== undefined) {
        await tx.offeringCoLecturer.deleteMany({ where: { offeringId } });
        if (patch.coLecturerIds.length) {
          await tx.offeringCoLecturer.createMany({
            data: patch.coLecturerIds.map((lecturerId) => ({ offeringId, lecturerId })),
          });
        }
      }
      if (patch.meetings !== undefined) {
        await tx.offeringMeeting.deleteMany({ where: { offeringId } });
        await tx.offeringMeeting.createMany({
          data: patch.meetings.map((meeting) => ({
            offeringId,
            ...meeting,
            room: meeting.room || null,
          })),
        });
      }
      await tx.offering.update({
        where: { id: offeringId },
        data: {
          courseSpecId: patch.courseSpecId !== undefined ? patch.courseSpecId : undefined,
          lecturerId: patch.lecturerId !== undefined ? patch.lecturerId : undefined,
          capacity: patch.capacity,
          status: patch.status,
          semester: period.semester,
          programmeYear: nextProgrammeYear,
          academicCalendarPeriodId: period.id,
          term: `${period.academicYearLabel}-${period.semester === "First" ? "S1" : "S2"}`,
          otherLecturers: patch.otherLecturers,
        },
      });
      await tx.$executeRaw(Prisma.sql`
        UPDATE offering_governance."OfferingCurriculumBinding"
        SET "updatedByUserId" = ${actorId}, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "offeringId" = ${offeringId}
      `);
    });

    return requireView(await offeringService.getById(offeringId));
  },
};
