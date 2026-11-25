import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.ts";

/**
 * Display metadata only. Call after existing offering authorization. Never
 * infer a curriculum from a term, latest version, or catalogue code.
 */
export async function loadOfferingOfficialCodes(
  offeringIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  const ids = [...new Set(offeringIds)];
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<Array<{ offeringId: string; code: string }>>(Prisma.sql`
    SELECT offering.id AS "offeringId", snapshot."courseCodeSnapshot" AS code
    FROM public."Offering" offering
    JOIN offering_governance."OfferingCurriculumBinding" binding
      ON binding."offeringId" = offering.id
    JOIN public."ProgrammeCurriculumCourse" placement
      ON placement.id = binding."curriculumCourseId" AND placement."courseId" = offering."courseId"
    JOIN public."ProgrammeCurriculumVersion" version
      ON version.id = placement."curriculumVersionId" AND version.status IN ('Approved', 'Active', 'Superseded')
    JOIN curriculum_artifact."CourseSnapshot" snapshot
      ON snapshot."placementId" = placement.id
      AND snapshot."curriculumVersionId" = version.id
      AND snapshot."courseId" = offering."courseId"
    WHERE offering.id IN (${Prisma.join(ids)})
  `);
  return new Map(rows.map((row) => [row.offeringId, row.code]));
}
