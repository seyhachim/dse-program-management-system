import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { CourseInfoSection } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { courseService } from "./service.ts";
import { courseSpecRevisionService } from "./revision-service.ts";

const runDbTests = process.env.COURSE_INFO_SNAPSHOT_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe("CourseSpec Course Information snapshots", () => {
  test("approved historical output survives live administrative edits and revisions snapshot the new values", async () => {
    const suffix = randomUUID();
    const lecturerRole = await prisma.role.findUniqueOrThrow({ where: { slug: "lecturer" } });
    const lecturer = await prisma.user.create({
      data: {
        email: `issue207-${suffix}@dse.invalid`,
        name: "Original Lecturer",
        title: "Dr.",
        qualification: "Original Qualification",
        phone: "000-207",
      },
    });
    await prisma.userRoleAssignment.create({
      data: { userId: lecturer.id, roleId: lecturerRole.id, programmeId: "dse" },
    });
    const course = await prisma.course.create({
      data: {
        code: `I207-${suffix.slice(0, 8)}`,
        title: "Original Course Title",
        description: "Original description",
        lecturerId: lecturer.id,
        credits: 3,
        prerequisites: "Original prerequisite",
        courseType: "Core",
        totalSltHours: 120,
        programmeId: "dse",
      },
    });
    const offering = await prisma.offering.create({
      data: {
        courseId: course.id,
        lecturerId: lecturer.id,
        term: `issue207-${suffix}`,
        sectionCode: `I207-${suffix.slice(0, 6)}`,
        otherLecturers: "Original Co Lecturer",
        semester: "First",
        programmeYear: 2,
      },
    });

    await courseService.saveSection(course.id, "courseInfo", {
      prerequisites: "Original prerequisite",
      description: "Original description",
    });
    const source = await prisma.courseSpec.findFirstOrThrow({
      where: { courseId: course.id },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
    });
    await prisma.courseSpec.update({
      where: { id: source.id },
      data: { reviewStatus: "Approved", approvedAt: new Date() },
    });

    const frozenBefore = await prisma.courseSpecCourseInfo.findUniqueOrThrow({
      where: { courseSpecId: source.id },
    });
    expect(frozenBefore).toMatchObject({
      courseTitle: "Original Course Title",
      courseCode: course.code,
      credits: 3,
      prerequisites: "Original prerequisite",
      description: "Original description",
      totalSltHours: 120,
      instructorName: "Original Lecturer",
      instructorTitle: "Dr.",
      qualification: "Original Qualification",
      telephone: "000-207",
      otherLecturers: "Original Co Lecturer",
      semester: "First",
      programmeYear: 2,
    });

    await prisma.course.update({
      where: { id: course.id },
      data: {
        code: `I207N-${suffix.slice(0, 7)}`,
        title: "Changed Course Title",
        credits: 4,
        prerequisites: "Changed prerequisite",
        description: "Changed description",
        totalSltHours: 180,
      },
    });
    await prisma.user.update({
      where: { id: lecturer.id },
      data: {
        name: "Changed Lecturer",
        title: "Prof.",
        qualification: "Changed Qualification",
        phone: "999-207",
      },
    });
    await prisma.offering.update({
      where: { id: offering.id },
      data: {
        otherLecturers: "Changed Co Lecturer",
        semester: "Second",
        programmeYear: 3,
      },
    });

    const currentRead = await courseService.getSpec(course.id);
    const historical = currentRead?.data.courseInfo as CourseInfoSection;
    expect(historical).toMatchObject({
      courseTitle: "Original Course Title",
      courseCode: frozenBefore.courseCode,
      credits: 3,
      totalSltHours: 120,
      instructorName: "Original Lecturer",
      instructorTitle: "Dr.",
      qualification: "Original Qualification",
      otherLecturers: "Original Co Lecturer",
      semester: "First",
      programmeYear: 2,
    });

    await expect(
      prisma.courseSpecCourseInfo.update({
        where: { courseSpecId: source.id },
        data: { courseTitle: "Illegal historical rewrite" },
      }),
    ).rejects.toThrow();

    const revision = await courseSpecRevisionService.createCourseSpecRevision({
      courseId: course.id,
      revisionType: "Minor",
      triggers: ["ProgrammeCoordinator"],
      reason: "Issue 207 regression fixture",
      changeSummary: "Capture current administrative metadata in the new revision",
      initiatedById: lecturer.id,
    });
    const revisedSnapshot = await prisma.courseSpecCourseInfo.findUniqueOrThrow({
      where: { courseSpecId: revision.id },
    });
    expect(revisedSnapshot).toMatchObject({
      courseTitle: "Changed Course Title",
      courseCode: `I207N-${suffix.slice(0, 7)}`,
      credits: 4,
      prerequisites: "Changed prerequisite",
      description: "Changed description",
      totalSltHours: 180,
      instructorName: "Changed Lecturer",
      instructorTitle: "Prof.",
      qualification: "Changed Qualification",
      telephone: "999-207",
      otherLecturers: "Changed Co Lecturer",
      semester: "Second",
      programmeYear: 3,
    });

    const frozenAfter = await prisma.courseSpecCourseInfo.findUniqueOrThrow({
      where: { courseSpecId: source.id },
    });
    expect(frozenAfter).toEqual(frozenBefore);

    await prisma.course.delete({ where: { id: course.id } });
    await prisma.user.delete({ where: { id: lecturer.id } });
  });
});
