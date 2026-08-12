import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

export type TeachingLearningProfile = {
  philosophyTags: string[];
  philosophyStatement: string;
  teachingMethodIds: string[];
  activeLearningStrategyIds: string[];
  independentLearningTypes: string[];
  resourceTypes: string[];
  technologyTypes: string[];
};

export const EMPTY_TEACHING_LEARNING_PROFILE: TeachingLearningProfile = {
  philosophyTags: [],
  philosophyStatement: "",
  teachingMethodIds: [],
  activeLearningStrategyIds: [],
  independentLearningTypes: [],
  resourceTypes: [],
  technologyTypes: [],
};

type TeachingLearningRow = TeachingLearningProfile & {
  courseSpecId: string;
};

export const teachingLearningService = {
  async get(courseId: string): Promise<TeachingLearningProfile> {
    const rows = await prisma.$queryRaw<TeachingLearningRow[]>(Prisma.sql`
      SELECT
        tl."courseSpecId",
        tl."philosophyTags",
        tl."philosophyStatement",
        tl."teachingMethodIds",
        tl."activeLearningStrategyIds",
        tl."independentLearningTypes",
        tl."resourceTypes",
        tl."technologyTypes"
      FROM "CourseSpecTeachingLearning" tl
      INNER JOIN "CourseSpec" cs ON cs."id" = tl."courseSpecId"
      WHERE cs."courseId" = ${courseId}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) return EMPTY_TEACHING_LEARNING_PROFILE;

    return {
      philosophyTags: row.philosophyTags ?? [],
      philosophyStatement: row.philosophyStatement ?? "",
      teachingMethodIds: row.teachingMethodIds ?? [],
      activeLearningStrategyIds: row.activeLearningStrategyIds ?? [],
      independentLearningTypes: row.independentLearningTypes ?? [],
      resourceTypes: row.resourceTypes ?? [],
      technologyTypes: row.technologyTypes ?? [],
    };
  },

  async save(
    courseId: string,
    value: TeachingLearningProfile,
  ): Promise<TeachingLearningProfile> {
    const spec = await prisma.courseSpec.upsert({
      where: { courseId },
      create: { courseId },
      update: {},
      select: { id: true },
    });

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "CourseSpecTeachingLearning" (
        "courseSpecId",
        "philosophyTags",
        "philosophyStatement",
        "teachingMethodIds",
        "activeLearningStrategyIds",
        "independentLearningTypes",
        "resourceTypes",
        "technologyTypes",
        "updatedAt"
      ) VALUES (
        ${spec.id},
        ${value.philosophyTags}::text[],
        ${value.philosophyStatement},
        ${value.teachingMethodIds}::text[],
        ${value.activeLearningStrategyIds}::text[],
        ${value.independentLearningTypes}::text[],
        ${value.resourceTypes}::text[],
        ${value.technologyTypes}::text[],
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("courseSpecId") DO UPDATE SET
        "philosophyTags" = EXCLUDED."philosophyTags",
        "philosophyStatement" = EXCLUDED."philosophyStatement",
        "teachingMethodIds" = EXCLUDED."teachingMethodIds",
        "activeLearningStrategyIds" = EXCLUDED."activeLearningStrategyIds",
        "independentLearningTypes" = EXCLUDED."independentLearningTypes",
        "resourceTypes" = EXCLUDED."resourceTypes",
        "technologyTypes" = EXCLUDED."technologyTypes",
        "updatedAt" = CURRENT_TIMESTAMP
    `);

    await prisma.courseSpecSection.upsert({
      where: {
        courseSpecId_sectionKey: {
          courseSpecId: spec.id,
          sectionKey: "teachingLearning",
        },
      },
      create: {
        courseSpecId: spec.id,
        sectionKey: "teachingLearning",
        status: "Complete",
      },
      update: { status: "Complete" },
    });

    return this.get(courseId);
  },
};

export type TeachingLearningService = typeof teachingLearningService;
