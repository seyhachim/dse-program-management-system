import type {
  ParentAcademicStatus,
  ParentOfficialCourseResult,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { calculateCourseGrade } from "./assessment-calculation.ts";

export interface ParentAcademicProjectionData {
  academicStatus: ParentAcademicStatus;
  progressionStatus: string | null;
  academicYear: string | null;
  programmeYear: number | null;
  officialResults: ParentOfficialCourseResult[];
}

export function parentAcademicStatusForProgression(
  progressionStatus: string | null,
): ParentAcademicStatus {
  if (progressionStatus === "Progressed" || progressionStatus === "Graduated") {
    return "ON_TRACK";
  }
  if (progressionStatus === "Retained" || progressionStatus === "Inactive") {
    return "NEEDS_ATTENTION";
  }
  return "UNAVAILABLE";
}

async function officialCourseResults(
  studentId: string,
  programmeId: string,
): Promise<ParentOfficialCourseResult[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      offering: { course: { programmeId } },
    },
    include: {
      results: {
        where: {
          publishedAt: { not: null },
          finalizedAt: { not: null },
        },
      },
      offering: {
        include: {
          course: true,
          courseSpec: {
            include: {
              assessmentItems: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return enrollments.flatMap((enrollment) => {
    const spec = enrollment.offering.courseSpec;
    if (!spec || spec.reviewStatus !== "Approved") return [];

    const finalized = enrollment.results.filter(
      (result) => result.courseSpecId === spec.id && result.finalizedAt !== null,
    );
    const grade = calculateCourseGrade(spec.assessmentItems, finalized);
    if (!grade.complete || grade.totalGrade === null) return [];

    const finalizedAt = finalized.reduce<Date | null>((latest, result) => {
      if (!result.finalizedAt) return latest;
      return !latest || result.finalizedAt > latest ? result.finalizedAt : latest;
    }, null);
    if (!finalizedAt) return [];

    return [{
      offeringId: enrollment.offeringId,
      courseCode: enrollment.offering.course.code,
      courseTitle: enrollment.offering.course.title,
      term: enrollment.offering.term,
      sectionCode: enrollment.offering.sectionCode,
      totalGrade: grade.totalGrade,
      finalizedAt: finalizedAt.toISOString(),
    }];
  });
}

export const parentAcademicProjectionService = {
  async forStudent(
    studentId: string,
    programmeId: string,
    includeOfficialResults: boolean,
  ): Promise<ParentAcademicProjectionData> {
    const membership = await prisma.studentCohortMembership.findFirst({
      where: {
        studentId,
        exitedAt: null,
        cohort: { programmeId },
      },
      include: {
        progressionRecords: {
          orderBy: [{ periodStart: "desc" }, { recordedAt: "desc" }],
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const progression = membership?.progressionRecords[0] ?? null;
    return {
      academicStatus: parentAcademicStatusForProgression(progression?.status ?? null),
      progressionStatus: progression?.status ?? null,
      academicYear: progression?.academicYear ?? null,
      programmeYear: progression?.programmeYear ?? null,
      officialResults: includeOfficialResults
        ? await officialCourseResults(studentId, programmeId)
        : [],
    };
  },
};
