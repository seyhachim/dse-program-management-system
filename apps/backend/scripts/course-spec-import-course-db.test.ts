import { describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_PROGRAMME_ID } from "../src/core/programme.ts";
import { ensureCourseForCourseSpecImport } from "./course-spec-import-course.ts";

const describeDb = process.env.COURSE_SPEC_IMPORT_DB_TESTS === "1" ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb("course-spec import Course catalog integrity", () => {
  test("preserves every existing Course catalog field when legacy metadata conflicts", async () => {
    const code = `ISS635-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const canonical = {
      programmeId: DEFAULT_PROGRAMME_ID,
      code,
      title: "Current Curriculum Title",
      description: "Current catalog description",
      prerequisites: "CURRENT101",
      credits: 3,
      courseType: "Core" as const,
      totalSltHours: 120,
      lecturerId: null,
    };

    try {
      const created = await prisma.course.create({ data: canonical });

      const result = await prisma.$transaction((tx) =>
        ensureCourseForCourseSpecImport(tx, {
          programmeId: DEFAULT_PROGRAMME_ID,
          code,
          title: "Stale Legacy Title",
          description: "Stale legacy description",
          prerequisites: null,
          credits: 4,
          courseType: "Basic",
          totalSltHours: 90,
          lecturerId: null,
        }),
      );

      expect(result).toEqual({ id: created.id, created: false });
      expect(
        await prisma.course.findUnique({
          where: { code },
          select: {
            programmeId: true,
            code: true,
            title: true,
            description: true,
            prerequisites: true,
            credits: true,
            courseType: true,
            totalSltHours: true,
            lecturerId: true,
          },
        }),
      ).toEqual(canonical);
    } finally {
      await prisma.course.deleteMany({ where: { code } });
      await prisma.$disconnect();
    }
  }, 30_000);

  test("creates a missing Course from reviewed canonical import metadata", async () => {
    const code = `ISS635-NEW-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const result = await prisma.$transaction((tx) =>
        ensureCourseForCourseSpecImport(tx, {
          programmeId: DEFAULT_PROGRAMME_ID,
          code,
          title: "Reviewed New Course",
          description: "Reviewed description",
          prerequisites: null,
          credits: 3,
          courseType: "Core",
          totalSltHours: 120,
          lecturerId: null,
        }),
      );

      expect(result.created).toBe(true);
      expect(await prisma.course.findUnique({ where: { code } })).toMatchObject({
        id: result.id,
        programmeId: DEFAULT_PROGRAMME_ID,
        code,
        title: "Reviewed New Course",
        credits: 3,
      });
    } finally {
      await prisma.course.deleteMany({ where: { code } });
      await prisma.$disconnect();
    }
  }, 30_000);
});
