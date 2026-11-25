import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

export async function findInvalidCurriculumCourseSpecBindings(
  versionId: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ courseCode: string }>>(Prisma.sql`
    SELECT COALESCE(snapshot."courseCodeSnapshot", course."code") AS "courseCode"
    FROM "ProgrammeCurriculumCourse" placement
    INNER JOIN "Course" course ON course."id" = placement."courseId"
    LEFT JOIN curriculum_artifact."CourseSnapshot" snapshot
      ON snapshot."placementId" = placement."id"
      AND snapshot."curriculumVersionId" = placement."curriculumVersionId"
      AND snapshot."courseId" = placement."courseId"
    LEFT JOIN "CourseSpec" spec ON spec."id" = placement."courseSpecVersionId"
    WHERE placement."curriculumVersionId" = ${versionId}
      AND (
        placement."courseSpecVersionId" IS NULL
        OR spec."id" IS NULL
        OR spec."courseId" <> placement."courseId"
        OR spec."reviewStatus" <> 'Approved'::"CourseSpecReviewStatus"
      )
    ORDER BY "courseCode"
  `);
  return rows.map((row) => row.courseCode);
}
