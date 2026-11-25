import { prisma } from "../../core/db/prisma.ts";

/**
 * Read the existing version-owned official code snapshot, never resolve course
 * identity by it. A legacy placement with no matching snapshot retains the
 * catalogue display code until its data can be reviewed.
 */
export async function loadCurriculumOfficialCodes(
  curriculumVersionId: string,
): Promise<ReadonlyMap<string, string>> {
  const rows = await prisma.$queryRaw<Array<{ placementId: string; code: string }>>`
    SELECT placement."id" AS "placementId", snapshot."courseCodeSnapshot" AS "code"
    FROM public."ProgrammeCurriculumCourse" placement
    INNER JOIN curriculum_artifact."CourseSnapshot" snapshot
      ON snapshot."placementId" = placement."id"
      AND snapshot."curriculumVersionId" = placement."curriculumVersionId"
      AND snapshot."courseId" = placement."courseId"
    WHERE placement."curriculumVersionId" = ${curriculumVersionId}
  `;
  return new Map(rows.map((row) => [row.placementId, row.code]));
}
