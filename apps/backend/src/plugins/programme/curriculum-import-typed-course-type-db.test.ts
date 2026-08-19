import { afterAll, describe, expect, test } from "bun:test";
import { CourseType, PrismaClient } from "@prisma/client";
import { curriculumImportService } from "./curriculum-import-service.ts";

const dbTestsEnabled = process.env.CURRICULUM_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();

const suffix = () => crypto.randomUUID().slice(0, 8);

describeDb("typed curriculum JSON course creation", () => {
  test("preview and apply use a validated source courseType without a redundant create decision", async () => {
    const token = suffix();
    const user = await prisma.user.create({
      data: {
        email: `typed-curriculum-import-${token}@example.test`,
        name: `Typed Curriculum Import ${token}`,
      },
    });
    const programme = await prisma.programme.create({
      data: {
        id: `typed-curriculum-import-${token}`,
        code: `TI${token}`,
        name: `Typed Curriculum Import ${token}`,
      },
    });
    const curriculum = await prisma.programmeCurriculum.create({
      data: {
        programmeId: programme.id,
        code: `DSE-${token}`,
        name: `Typed Curriculum ${token}`,
      },
    });
    const version = await prisma.programmeCurriculumVersion.create({
      data: {
        curriculumId: curriculum.id,
        versionMajor: 1,
        versionMinor: 0,
        createdById: user.id,
      },
    });
    const courseCode = `NEW-${token}`;
    const upload = {
      fileName: `typed-${token}.json`,
      jsonText: JSON.stringify({
        formatVersion: "dse-curriculum-v1",
        programmeCode: programme.code,
        curriculum: {
          code: curriculum.code,
          name: curriculum.name,
          academicYear: "",
          version: "1.0",
          defaultPathwayCode: null,
        },
        pathways: [],
        courses: [
          {
            code: courseCode,
            title: `Typed New Course ${token}`,
            yearLevel: 1,
            semester: "First",
            pathwayCode: null,
            sortOrder: 0,
            weeklyHours: { total: 3, lecture: 2, lab: 1, fieldVisit: 0 },
            credits: {
              total: 3,
              lecture: 0,
              lab: 0,
              fieldVisit: 0,
              breakdownProvided: false,
            },
            lecturerText: "",
            courseType: "Specialization",
          },
        ],
        declaredTotals: {
          semesterCredits: [{ yearLevel: 1, semester: "First", credits: 3 }],
          pathwayCredits: [],
          programmeCourseCount: 1,
          programmeCredits: 3,
        },
      }),
    };

    const beforeCourses = await prisma.course.count({ where: { programmeId: programme.id } });
    const preview = await curriculumImportService.preview(version.id, upload);

    expect(preview.canApply).toBe(true);
    expect(preview.blockers).toEqual([]);
    expect(preview.courses[0]?.matchStatus).toBe("missing");
    expect(preview.courses[0]?.requiredDecision).toBeNull();
    expect(preview.courses[0]?.courseType).toBe("Specialization");
    expect(preview.courses[0]?.message).toContain("source type Specialization");
    expect(await prisma.course.count({ where: { programmeId: programme.id } })).toBe(beforeCourses);

    const artifact = await curriculumImportService.apply(version.id, user.id, {
      ...upload,
      decisions: [],
    });

    const created = await prisma.course.findFirstOrThrow({
      where: { programmeId: programme.id, code: courseCode },
    });
    expect(created.courseType).toBe(CourseType.Specialization);
    expect(created.credits).toBe(3);
    expect(artifact.source?.decisions).toEqual([]);
    expect(artifact.totals.selectedRouteCourseCount).toBe(1);
    expect(artifact.totals.selectedRouteCredits).toBe(3);

    const placement = await prisma.programmeCurriculumCourse.findFirstOrThrow({
      where: { curriculumVersionId: version.id, courseId: created.id },
    });
    expect(placement.courseTypeSnapshot).toBe(CourseType.Specialization);
    expect(placement.creditsSnapshot).toBe(3);
    expect(await prisma.courseSpec.count({ where: { courseId: created.id } })).toBe(0);
    expect(await prisma.offering.count({ where: { courseId: created.id } })).toBe(0);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
