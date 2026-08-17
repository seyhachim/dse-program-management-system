import {
  PROGRAMME_TITLE,
  type CourseInfoSection,
  type LecturersServiceContract,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";

type CourseSnapshotSource = {
  id: string;
  title: string;
  code: string;
  description: string | null;
  credits: number | null;
  prerequisites: string | null;
  courseType: string | null;
  totalSltHours: number | null;
  lecturerId: string | null;
};

function lecturers(): LecturersServiceContract {
  return registry.get<LecturersServiceContract>("lecturers").service;
}

/** Capture current administrative values once for one academic CourseSpec version. */
export async function buildCourseInfoSnapshot(
  course: CourseSnapshotSource,
): Promise<CourseInfoSection> {
  const lecturer = course.lecturerId
    ? await lecturers().getById(course.lecturerId)
    : null;
  const offering = await prisma.offering.findFirst({
    where: { courseId: course.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return {
    programmeTitle: PROGRAMME_TITLE,
    courseTitle: course.title,
    courseCode: course.code,
    credits: course.credits,
    prerequisites: course.prerequisites ?? "",
    courseType: (course.courseType as CourseInfoSection["courseType"]) ?? null,
    description: course.description ?? "",
    totalSltHours: course.totalSltHours,
    instructorName: lecturer?.name ?? "",
    instructorTitle: lecturer?.title ?? "",
    qualification: lecturer?.qualification ?? "",
    email: lecturer?.email ?? "",
    telephone: lecturer?.phone ?? "",
    otherLecturers: offering?.otherLecturers ?? "",
    semester: offering?.semester ?? null,
    programmeYear: offering?.programmeYear ?? null,
  };
}

export async function buildCourseInfoSnapshotByCourseId(
  courseId: string,
): Promise<CourseInfoSection | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  return course ? buildCourseInfoSnapshot(course) : null;
}

/** Prisma nested-create payload; intentionally contains values only, no live FKs. */
export function courseInfoSnapshotData(snapshot: CourseInfoSection) {
  return {
    programmeTitle: snapshot.programmeTitle ?? PROGRAMME_TITLE,
    courseTitle: snapshot.courseTitle,
    courseCode: snapshot.courseCode,
    credits: snapshot.credits ?? null,
    prerequisites: snapshot.prerequisites ?? "",
    courseType: snapshot.courseType ?? null,
    description: snapshot.description ?? "",
    totalSltHours: snapshot.totalSltHours ?? null,
    instructorName: snapshot.instructorName ?? "",
    instructorTitle: snapshot.instructorTitle ?? "",
    qualification: snapshot.qualification ?? "",
    email: snapshot.email ?? "",
    telephone: snapshot.telephone ?? "",
    otherLecturers: snapshot.otherLecturers ?? "",
    semester: snapshot.semester ?? null,
    programmeYear: snapshot.programmeYear ?? null,
  };
}
