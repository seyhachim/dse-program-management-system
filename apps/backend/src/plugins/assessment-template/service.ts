import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

export type AssessmentTemplateItem = {
  assessmentId: string;
  assessmentCategory: "continuous" | "final";
  topicNumbers: number[];
  physicalSltHours: number | null;
  onlineSltHours: number | null;
  independentSltHours: number | null;
};

type AssessmentTemplateRow = {
  assessmentId: string;
  assessmentCategory: string;
  topicNumbers: number[];
  physicalSltHours: number | null;
  onlineSltHours: number | null;
  independentSltHours: number | null;
};

async function readItems(
  client: Prisma.TransactionClient | typeof prisma,
  courseId: string,
): Promise<AssessmentTemplateItem[]> {
  const rows = await client.$queryRaw<AssessmentTemplateRow[]>(Prisma.sql`
    SELECT
      ai."id" AS "assessmentId",
      ai."assessmentCategory",
      ai."topicNumbers",
      ai."physicalSltHours",
      ai."onlineSltHours",
      ai."independentSltHours"
    FROM "CourseSpecAssessmentItem" ai
    INNER JOIN "CourseSpec" cs ON cs."id" = ai."courseSpecId"
    WHERE cs."courseId" = ${courseId}
    ORDER BY ai."order" ASC
  `);

  return rows.map((row) => ({
    assessmentId: row.assessmentId,
    assessmentCategory:
      row.assessmentCategory === "final" ? "final" : "continuous",
    topicNumbers: row.topicNumbers ?? [],
    physicalSltHours: row.physicalSltHours,
    onlineSltHours: row.onlineSltHours,
    independentSltHours: row.independentSltHours,
  }));
}

export const assessmentTemplateService = {
  get(courseId: string) {
    return readItems(prisma, courseId);
  },

  async save(courseId: string, items: AssessmentTemplateItem[]) {
    return prisma.$transaction(async (tx) => {
      const spec = await tx.courseSpec.findUnique({
        where: { courseId },
        select: { id: true },
      });
      if (!spec) throw new Error("Course specification not found");

      const assessmentIds = items.map((item) => item.assessmentId);
      const known = assessmentIds.length
        ? await tx.courseSpecAssessmentItem.findMany({
            where: {
              courseSpecId: spec.id,
              id: { in: assessmentIds },
            },
            select: { id: true },
          })
        : [];
      const knownIds = new Set(known.map((item) => item.id));
      const invalid = assessmentIds.find((id) => !knownIds.has(id));
      if (invalid) {
        throw new Error(
          "Assessment template metadata references an assessment outside this course specification",
        );
      }

      for (const item of items) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "CourseSpecAssessmentItem"
          SET
            "assessmentCategory" = ${item.assessmentCategory},
            "topicNumbers" = ${item.topicNumbers}::integer[],
            "physicalSltHours" = ${item.physicalSltHours},
            "onlineSltHours" = ${item.onlineSltHours},
            "independentSltHours" = ${item.independentSltHours}
          WHERE "courseSpecId" = ${spec.id}
            AND "id" = ${item.assessmentId}
        `);
      }

      return readItems(tx, courseId);
    });
  },
};

export type AssessmentTemplateService = typeof assessmentTemplateService;
