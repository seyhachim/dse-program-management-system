import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { assertCourseSpecEditable } from "../courses/spec-lock.ts";

export type WeekProjectProgress = {
  weekId: string;
  milestone: string;
  expectedProgress: string;
  deliverable: string;
  status: "planned" | "in_progress" | "completed";
};

const EMPTY = (weekId: string): WeekProjectProgress => ({
  weekId,
  milestone: "",
  expectedProgress: "",
  deliverable: "",
  status: "planned",
});

type Row = WeekProjectProgress & { courseSpecId: string };

export const weekProjectProgressService = {
  async get(courseId: string, weekId: string): Promise<WeekProjectProgress> {
    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        p."courseSpecId",
        p."weekId",
        p."milestone",
        p."expectedProgress",
        p."deliverable",
        p."status"
      FROM "CourseSpecWeekProjectProgress" p
      INNER JOIN "CourseSpec" cs ON cs."id" = p."courseSpecId"
      WHERE cs."courseId" = ${courseId} AND p."weekId" = ${weekId}
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) return EMPTY(weekId);

    return {
      weekId: row.weekId,
      milestone: row.milestone ?? "",
      expectedProgress: row.expectedProgress ?? "",
      deliverable: row.deliverable ?? "",
      status:
        row.status === "in_progress" || row.status === "completed"
          ? row.status
          : "planned",
    };
  },

  async save(
    courseId: string,
    value: WeekProjectProgress,
  ): Promise<WeekProjectProgress> {
    const existingSpec = await prisma.courseSpec.findFirst({
      where: { courseId },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      select: { id: true, reviewStatus: true },
    });
    if (existingSpec) assertCourseSpecEditable(existingSpec.reviewStatus);

    const spec =
      existingSpec ??
      (await prisma.courseSpec.create({
        data: { courseId },
        select: { id: true, reviewStatus: true },
      }));

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "CourseSpecWeekProjectProgress" (
        "courseSpecId",
        "weekId",
        "milestone",
        "expectedProgress",
        "deliverable",
        "status",
        "updatedAt"
      ) VALUES (
        ${spec.id},
        ${value.weekId},
        ${value.milestone},
        ${value.expectedProgress},
        ${value.deliverable},
        ${value.status},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("courseSpecId", "weekId") DO UPDATE SET
        "milestone" = EXCLUDED."milestone",
        "expectedProgress" = EXCLUDED."expectedProgress",
        "deliverable" = EXCLUDED."deliverable",
        "status" = EXCLUDED."status",
        "updatedAt" = CURRENT_TIMESTAMP
    `);

    return this.get(courseId, value.weekId);
  },
};
