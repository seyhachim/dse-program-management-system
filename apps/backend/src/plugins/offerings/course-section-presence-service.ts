import { prisma } from "../../core/db/prisma.ts";

/**
 * Narrow Offering-existence metadata for cross-plugin consumers.
 *
 * This intentionally returns only distinct course ids, not Offering rows, so a
 * Responsible Lecturer can learn whether a class section exists without gaining
 * access to another lecturer's section details.
 */
export const courseSectionPresenceService = {
  async courseIdsWithOfferings(courseIds: readonly string[]): Promise<string[]> {
    const uniqueCourseIds = [...new Set(courseIds)];
    if (uniqueCourseIds.length === 0) return [];

    const rows = await prisma.offering.findMany({
      where: { courseId: { in: uniqueCourseIds } },
      select: { courseId: true },
      distinct: ["courseId"],
    });

    return rows.map((row) => row.courseId);
  },
};
