import type { CourseType, Prisma } from "@prisma/client";

export type CourseSpecImportCourseInput = {
  programmeId: string;
  code: string;
  title: string;
  description: string | null;
  prerequisites: string | null;
  credits: number | null;
  courseType: CourseType | null;
  totalSltHours: number | null;
  lecturerId: string | null;
};

/**
 * Ensure a Course exists for a CourseSpec import without mutating an existing
 * catalog row. Legacy Course Information belongs to the immutable CourseSpec
 * snapshot; it is not authoritative enough to rewrite current curriculum data.
 */
export async function ensureCourseForCourseSpecImport(
  tx: Prisma.TransactionClient,
  input: CourseSpecImportCourseInput,
): Promise<{ id: string; created: boolean }> {
  const existing = await tx.course.findUnique({
    where: { code: input.code },
    select: { id: true },
  });

  if (existing) return { id: existing.id, created: false };

  const created = await tx.course.create({
    data: {
      programmeId: input.programmeId,
      code: input.code,
      title: input.title,
      description: input.description,
      prerequisites: input.prerequisites,
      credits: input.credits,
      courseType: input.courseType,
      totalSltHours: input.totalSltHours,
      lecturerId: input.lecturerId,
    },
    select: { id: true },
  });

  return { id: created.id, created: true };
}
