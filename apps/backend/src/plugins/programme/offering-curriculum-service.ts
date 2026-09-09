import type {
  OfferingCurriculumPlacementRef,
  OfferingCurriculumServiceContract,
  OfferingCurriculumVersionRef,
  Semester,
} from "@dse-pms/shared-types";
import { Semester as PrismaSemester, type ProgrammeCurriculumStatus } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

const DELIVERY_STATUSES: ProgrammeCurriculumStatus[] = ["Approved", "Active", "Superseded"];

function versionRef(row: {
  id: string;
  curriculumId: string;
  versionMajor: number;
  versionMinor: number;
  status: ProgrammeCurriculumStatus;
  cohortLabel: string;
  intakeYear: number | null;
  academicYear: string;
  curriculum: { code: string; name: string };
}): OfferingCurriculumVersionRef {
  if (row.status === "Draft") {
    throw new Error("Draft curriculum versions cannot authorize delivery");
  }
  return {
    id: row.id,
    curriculumId: row.curriculumId,
    curriculumCode: row.curriculum.code,
    curriculumName: row.curriculum.name,
    versionMajor: row.versionMajor,
    versionMinor: row.versionMinor,
    version: `${row.versionMajor}.${row.versionMinor}`,
    status: row.status,
    cohortLabel: row.cohortLabel,
    intakeYear: row.intakeYear,
    academicYear: row.academicYear,
  };
}

function placementRef(row: {
  id: string;
  curriculumVersionId: string;
  courseId: string;
  yearLevel: number;
  semester: Semester;
  creditsSnapshot: number;
  courseTypeSnapshot: string;
  pathwayId: string | null;
  courseSpecVersionId: string | null;
  course: { code: string; title: string };
}): OfferingCurriculumPlacementRef {
  return {
    id: row.id,
    curriculumVersionId: row.curriculumVersionId,
    courseId: row.courseId,
    courseCode: row.course.code,
    courseTitle: row.course.title,
    yearLevel: row.yearLevel,
    semester: row.semester,
    creditsSnapshot: row.creditsSnapshot,
    courseTypeSnapshot: row.courseTypeSnapshot,
    pathwayId: row.pathwayId,
    courseSpecVersionId: row.courseSpecVersionId,
  };
}

export const offeringCurriculumService: OfferingCurriculumServiceContract = {
  async listVersions(programmeId) {
    const rows = await prisma.programmeCurriculumVersion.findMany({
      where: {
        status: { in: DELIVERY_STATUSES },
        curriculum: { programmeId },
      },
      include: { curriculum: { select: { code: true, name: true } } },
      orderBy: [
        { intakeYear: "desc" },
        { versionMajor: "desc" },
        { versionMinor: "desc" },
      ],
    });
    return rows.map(versionRef);
  },

  async listPlacements(programmeId, curriculumVersionId, studyYear, semester) {
    const version = await prisma.programmeCurriculumVersion.findFirst({
      where: {
        id: curriculumVersionId,
        status: { in: DELIVERY_STATUSES },
        curriculum: { programmeId },
      },
      select: { id: true },
    });
    if (!version) return [];

    const rows = await prisma.programmeCurriculumCourse.findMany({
      where: {
        curriculumVersionId,
        yearLevel: studyYear,
        semester: semester as PrismaSemester,
      },
      include: { course: { select: { code: true, title: true } } },
      orderBy: [{ sortOrder: "asc" }, { course: { code: "asc" } }],
    });
    return rows.map((row) => placementRef({
      ...row,
      semester: row.semester as Semester,
      courseTypeSnapshot: row.courseTypeSnapshot,
    }));
  },

  async getPlacement(programmeId, curriculumCourseId) {
    const row = await prisma.programmeCurriculumCourse.findFirst({
      where: {
        id: curriculumCourseId,
        curriculumVersion: {
          status: { in: DELIVERY_STATUSES },
          curriculum: { programmeId },
        },
      },
      include: { course: { select: { code: true, title: true } } },
    });
    return row
      ? placementRef({
          ...row,
          semester: row.semester as Semester,
          courseTypeSnapshot: row.courseTypeSnapshot,
        })
      : null;
  },

  async getVersion(programmeId, curriculumVersionId) {
    const row = await prisma.programmeCurriculumVersion.findFirst({
      where: {
        id: curriculumVersionId,
        status: { in: DELIVERY_STATUSES },
        curriculum: { programmeId },
      },
      include: { curriculum: { select: { code: true, name: true } } },
    });
    return row ? versionRef(row) : null;
  },
};
