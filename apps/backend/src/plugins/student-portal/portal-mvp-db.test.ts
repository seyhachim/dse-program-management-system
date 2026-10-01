import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { academicCalendarService } from "../programme/academic-calendar-service.ts";
import { programmePlugin } from "../programme/index.ts";
import { PortalAccessError, PortalNotFoundError, studentPortalService } from "./service.ts";

const runDbTests = process.env.STUDENT_PORTAL_MVP_DB_TESTS === "1";
const dbDescribe = runDbTests ? describe : describe.skip;

dbDescribe("Student Portal MVP authorization and publication boundaries", () => {
  test("scopes reads/downloads to the active student enrollment and preserves historical offerings", async () => {
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
    const historicalOffering = await prisma.offering.create({
      data: {
        courseId: spec.courseId,
        courseSpecId: spec.id,
        lecturerId: lecturer.id,
        term: `portal-mvp-history-${suffix}`,
        sectionCode: `H-${suffix.slice(0, 8)}`,
        capacity: 10,
        status: "Completed",
      },
    });
    const student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        name: "Portal MVP Student",
        email: studentUser.email,
        studentId: null,
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
    await prisma.enrollment.createMany({
      data: [
        { offeringId: offering.id, studentId: student.id },
        { offeringId: historicalOffering.id, studentId: student.id },
      ],
    });

    const now = Date.now();
    await prisma.courseAnnouncement.createMany({
      data: [
        { offeringId: offering.id, authorId: lecturer.id, title: "Visible", body: "Visible now", publishedAt: new Date(now - 60_000) },
        { offeringId: offering.id, authorId: lecturer.id, title: "Future", body: "Not yet", publishedAt: new Date(now + 86_400_000) },
      ],
    });

    try {
      const home = await studentPortalService.home(studentUser.id);
      expect(home.student.id).toBe(student.id);
      expect(home.student.studentId).toBeNull();
      expect(home.student.email).toBe(studentUser.email);

      const courses = await studentPortalService.courses(studentUser.id);
      expect(courses.find((course) => course.offeringId === offering.id)?.lifecycle).toBe("current");
      expect(courses.find((course) => course.offeringId === historicalOffering.id)?.lifecycle).toBe("historical");

      const detail = await studentPortalService.course(studentUser.id, offering.id);
      expect(detail.specAvailable).toBe(true);
      expect(detail.lifecycle).toBe("current");

      const document = await studentPortalService.courseDocument(studentUser.id, offering.id);
      expect(document.fileName).toContain("approved-course-specification.html");
      expect(document.contentType).toBe("text/html; charset=utf-8");

      const historicalDetail = await studentPortalService.course(studentUser.id, historicalOffering.id);
      expect(historicalDetail.specAvailable).toBe(true);
      expect(historicalDetail.lifecycle).toBe("historical");

      const historicalDocument = await studentPortalService.courseDocument(studentUser.id, historicalOffering.id);
      expect(historicalDocument.fileName).toContain("approved-course-specification.html");

      await expect(studentPortalService.course(otherUser.id, offering.id)).rejects.toBeInstanceOf(PortalNotFoundError);
      await expect(studentPortalService.courseDocument(otherUser.id, offering.id)).rejects.toBeInstanceOf(PortalNotFoundError);
      await expect(studentPortalService.course(otherUser.id, historicalOffering.id)).rejects.toBeInstanceOf(PortalNotFoundError);

      const announcements = await studentPortalService.announcements(studentUser.id);
      expect(announcements.map((announcement) => announcement.title)).toEqual(["Visible"]);

      await prisma.student.update({ where: { id: student.id }, data: { status: "Inactive" } });
      await expect(studentPortalService.courses(studentUser.id)).rejects.toBeInstanceOf(PortalAccessError);
    } finally {
      await prisma.offering.deleteMany({ where: { id: { in: [offering.id, historicalOffering.id] } } }).catch(() => undefined);
      await prisma.student.deleteMany({ where: { id: { in: [student.id, otherStudent.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [lecturer.id, studentUser.id, otherUser.id] } } });
    }
  });


  test("resolves the published calendar from a neutral Continuing current-study-year record", async () => {
    if (!registry.has("programme")) registry.register(programmePlugin);

    const suffix = randomUUID();
    const programmeId = `portal-calendar-${suffix}`;
    const actor = await prisma.user.create({
      data: { email: `portal-calendar-actor-${suffix}@dse.invalid`, name: "Portal Calendar Coordinator" },
    });
    const studentUser = await prisma.user.create({
      data: { email: `portal-calendar-student-${suffix}@dse.invalid`, name: "Portal Calendar Student" },
    });
    await prisma.programme.create({
      data: {
        id: programmeId,
        code: `PC-${suffix.slice(0, 8)}`,
        name: "Portal Calendar Programme",
        status: "active",
      },
    });
    const student = await prisma.student.create({
      data: {
        userId: studentUser.id,
        name: studentUser.name,
        email: studentUser.email,
        studentId: `PC-S-${suffix}`,
        status: "Active",
      },
    });
    const cohort = await prisma.studentCohort.create({
      data: {
        programmeId,
        code: `PC-C-${suffix.slice(0, 8)}`,
        name: "Portal Calendar Cohort",
        intakeYear: 2025,
        expectedGraduationYear: 2029,
      },
    });
    const membership = await prisma.studentCohortMembership.create({
      data: {
        cohortId: cohort.id,
        studentId: student.id,
        joinedAt: new Date("2025-09-01"),
      },
    });

    const academicYear = await academicCalendarService.createAcademicYear(programmeId, {
      label: "2027-2028",
      startYear: 2027,
      endYear: 2028,
      isCurrent: true,
    });
    const calendar = await academicCalendarService.createCalendar(programmeId, actor.id, {
      academicYearId: academicYear.id,
      revisionReason: "Student Portal Continuing context test",
      studyYears: [3],
      periods: [{
        semester: "First",
        teachingStart: "2027-09-01",
        teachingEnd: "2028-01-15",
      }],
      events: [],
      sourceTitle: "Official Year 3 Calendar",
      sourcePublishedAt: "2027-08-20",
      sourceUrl: null,
      sourceFileRef: null,
      sourceNote: "Test source",
    });
    await academicCalendarService.publishCalendar(programmeId, calendar.id, actor.id);

    await prisma.studentProgressionRecord.create({
      data: {
        membershipId: membership.id,
        academicYear: academicYear.label,
        term: "Academic year",
        programmeYear: 3,
        periodStart: new Date("2027-09-01"),
        periodEnd: new Date("2028-06-30"),
        status: "Continuing",
      },
    });

    const view = await studentPortalService.academicCalendar(studentUser.id);
    expect(view.status).toBe("available");
    if (view.status === "available") {
      expect(view.studyYear).toBe(3);
      expect(view.academicYear.label).toBe("2027-2028");
      expect(view.periods[0]?.teachingStart).toBe("2027-09-01");
    }
  });
});
