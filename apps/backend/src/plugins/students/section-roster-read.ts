import type { CanonicalSectionRosterRef } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

type SectionContextRow = {
  sectionId: string;
  cohortId: string;
  programmeId: string;
  code: string;
  name: string;
  active: boolean;
};

type SectionStudentRow = {
  id: string;
  name: string;
  studentId: string | null;
};

/**
 * Narrow canonical section-roster projection for other plugins. A student is
 * current only when the section membership and cohort membership are both open
 * and the Student record itself is Active.
 */
export async function getCanonicalSectionRoster(
  sectionId: string,
): Promise<CanonicalSectionRosterRef | null> {
  const sections = await prisma.$queryRaw<SectionContextRow[]>`
    SELECT s."id" AS "sectionId", s."cohortId", c."programmeId",
           s."code", s."name", s."active"
    FROM "StudentCohortSection" s
    JOIN "StudentCohort" c ON c."id" = s."cohortId"
    WHERE s."id" = ${sectionId}
    LIMIT 1
  `;
  const section = sections[0];
  if (!section) return null;

  const students = await prisma.$queryRaw<SectionStudentRow[]>`
    SELECT st."id", st."name", st."studentId"
    FROM "StudentCohortSectionMembership" sm
    JOIN "Student" st ON st."id" = sm."studentId"
    WHERE sm."sectionId" = ${sectionId}
      AND sm."cohortId" = ${section.cohortId}
      AND sm."exitedAt" IS NULL
      AND st."status" = 'Active'::"StudentStatus"
      AND EXISTS (
        SELECT 1
        FROM "StudentCohortMembership" cm
        WHERE cm."cohortId" = sm."cohortId"
          AND cm."studentId" = sm."studentId"
          AND cm."exitedAt" IS NULL
      )
    ORDER BY st."studentId" ASC NULLS LAST, st."name" ASC
  `;

  return { ...section, students };
}
