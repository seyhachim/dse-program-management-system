import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError, PortalNotFoundError, studentPortalService } from "./service.ts";

const runDbTests = process.env.STUDENT_PORTAL_MVP_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe("Student Portal MVP authorization and publication boundaries", () => {
  test("scopes reads/downloads to the active student enrollment and hides future announcements", async () => {
    const suffix = randomUUID();
    const lecturer = await prisma.user.create({
      data: { email: `portal-mvp-lecturer-${suffix}@dse.invalid`, name: "Portal MVP Lecturer" },
    });
    const studentUser = await prisma.user.create({
      data: { email: `portal-mvp-student-${suffix}@dse.invalid`, name: "Portal MVP Student" },
    });
    const otherUser = await prisma.user.create({
      data: { email: `portal-mvp-other-${suffix}@dse.invalid`, name: "Portal MVP Other Student" },
    });

    const spec = await prisma.courseSpec.findFirstOrThrow({
      where: { reviewStatus: "Approved" },
      orderBy: [{ versionMajor: "desc" }, { versionMinor: "desc" }],
      select: { id: true, courseId: true },
    });
    const offering = await prisma.offering.create({
      data: {
        courseId: spec.courseId,
        courseSpecId: spec.id,
        lecturerId: lecturer.id,
        term: `portal-mvp-${suffix}`,
        sectionCode: `MVP-${suffix.slice(0, 8)}`,
        capacity: 10,
        status: "Active",
      },
    });
    const student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        name: "Portal MVP Student",
        email: studentUser.email,
        studentId: `MVP-S-${suffix}`,
        status: "Active",
      },
    });
    const otherStudent = await prisma.student.create({
      data: {
        userId: otherUser.id,
        name: "Portal MVP Other",
        email: otherUser.email,
        studentId: `MVP-O-${suffix}`,
        status: "Active",
      },
    });
    await prisma.enrollment.create({ data: { offeringId: offering.id, studentId: student.id } });

    const now = Date.now();
    await prisma.courseAnnouncement.createMany({
      data: [
        { offeringId: offering.id, authorId: lecturer.id, title: "Visible", body: "Visible now", publishedAt: new Date(now - 60_000) },
        { offeringId: offering.id, authorId: lecturer.id, title: "Future", body: "Not yet", publishedAt: new Date(now + 86_400_000) },
      ],
    });

    try {
      const courses = await studentPortalService.courses(studentUser.id);
      expect(courses.map((course) => course.offeringId)).toEqual([offering.id]);

      const detail = await studentPortalService.course(studentUser.id, offering.id);
      expect(detail.specAvailable).toBe(true);

      const document = await studentPortalService.courseDocument(studentUser.id, offering.id);
      expect(document.fileName).toContain("approved-course-specification.html");
      expect(document.contentType).toBe("text/html; charset=utf-8");

      await expect(studentPortalService.course(otherUser.id, offering.id)).rejects.toBeInstanceOf(PortalNotFoundError);
      await expect(studentPortalService.courseDocument(otherUser.id, offering.id)).rejects.toBeInstanceOf(PortalNotFoundError);

      const announcements = await studentPortalService.announcements(studentUser.id);
      expect(announcements.map((announcement) => announcement.title)).toEqual(["Visible"]);

      await prisma.student.update({ where: { id: student.id }, data: { status: "Inactive" } });
      await expect(studentPortalService.courses(studentUser.id)).rejects.toBeInstanceOf(PortalAccessError);
    } finally {
      await prisma.offering.delete({ where: { id: offering.id } }).catch(() => undefined);
      await prisma.student.deleteMany({ where: { id: { in: [student.id, otherStudent.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [lecturer.id, studentUser.id, otherUser.id] } } });
    }
  });
});
