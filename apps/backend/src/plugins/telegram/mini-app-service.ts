import type { CourseFeedbackInput } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { attendanceService } from "../offerings/attendance-service.ts";
import { offeringService } from "../offerings/service.ts";
import {
  PortalAccessError,
  PortalNotFoundError,
  studentPortalService,
} from "../student-portal/service.ts";
import type { TelegramSessionUser } from "./session.ts";
import { telegramIdentityStore } from "./identity-store.ts";

const WIDE_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];

function authUser(user: TelegramSessionUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    programmeRoles: user.programmeRoles,
  };
}

function isStudent(user: TelegramSessionUser) {
  return user.roles.includes("student");
}

async function assertOfferingAccess(user: TelegramSessionUser, offeringId: string, write = false) {
  const offering = await offeringService.getById(offeringId);
  if (!offering) throw new PortalNotFoundError("Offering not found");
  const programmeId = offering.course?.programmeId ?? null;
  const assigned =
    offering.lecturer?.id === user.id || offering.coLecturers.some((item) => item.id === user.id);
  const programmeWide = hasAnyRoleInProgramme(authUser(user), WIDE_ROLES, programmeId);
  if (!assigned && !programmeWide) {
    throw new PortalAccessError(
      write ? "You can only change attendance for your own offerings" : "You cannot access this offering",
    );
  }
  return offering;
}

function nextMeeting(meetings: Array<{
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  room: string | null;
  activityType: string;
}>) {
  const meeting = meetings[0];
  if (!meeting) return null;
  return {
    dayOfWeek: meeting.dayOfWeek,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    room: meeting.room,
    activityType: meeting.activityType,
  };
}

async function lecturerCourses(user: TelegramSessionUser) {
  const programmeIds = user.programmeRoles
    .filter((assignment) => WIDE_ROLES.includes(assignment.role) && assignment.programmeId)
    .map((assignment) => assignment.programmeId as string);
  const globallyWide = user.programmeRoles.some(
    (assignment) => WIDE_ROLES.includes(assignment.role) && assignment.programmeId === null,
  );

  const offerings = await prisma.offering.findMany({
    where: globallyWide
      ? {}
      : {
          OR: [
            { lecturerId: user.id },
            { coLecturers: { some: { lecturerId: user.id } } },
            ...(programmeIds.length ? [{ course: { programmeId: { in: programmeIds } } }] : []),
          ],
        },
    include: { course: true, meetings: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] } },
    orderBy: [{ term: "desc" }, { course: { code: "asc" } }, { sectionCode: "asc" }],
  });

  return offerings.map((offering) => ({
    offeringId: offering.id,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    sectionCode: offering.sectionCode,
    term: offering.term,
    role: "lecturer" as const,
    nextMeeting: nextMeeting(offering.meetings),
  }));
}

async function studentCourses(userId: string) {
  const courses = await studentPortalService.courses(userId);
  return courses.map((course) => ({
    offeringId: course.offeringId,
    courseCode: course.code,
    courseTitle: course.title,
    sectionCode: course.sectionCode,
    term: course.term,
    role: "student" as const,
    nextMeeting: nextMeeting(course.meetings),
  }));
}

export const telegramMiniAppService = {
  async courses(user: TelegramSessionUser) {
    if (isStudent(user)) return studentCourses(user.id);
    return lecturerCourses(user);
  },

  async home(user: TelegramSessionUser) {
    const courses = await this.courses(user);
    let unreadAnnouncements = 0;
    let publishedResultCount = 0;
    let surveyActions = 0;
    if (isStudent(user)) {
      const [announcements, details] = await Promise.all([
        studentPortalService.announcements(user.id),
        Promise.all(courses.map((course) => studentPortalService.course(user.id, course.offeringId))),
      ]);
      unreadAnnouncements = announcements.length;
      publishedResultCount = details.reduce(
        (sum, course) => sum + course.assessments.filter((assessment) => assessment.result).length,
        0,
      );
      surveyActions = details.filter((course) => !course.feedbackSubmitted).length;
    }
    return {
      user: { id: user.id, name: user.name, email: user.email, roles: user.roles },
      courses,
      unreadAnnouncements,
      publishedResultCount,
      surveyActions,
    };
  },

  async course(user: TelegramSessionUser, offeringId: string) {
    if (isStudent(user)) return studentPortalService.course(user.id, offeringId);
    await assertOfferingAccess(user, offeringId);
    const row = await prisma.offering.findUnique({
      where: { id: offeringId },
      include: {
        course: true,
        meetings: true,
        enrollments: { include: { student: { select: { id: true, studentId: true, name: true } } } },
        announcements: { where: { publishedAt: { not: null } }, orderBy: { publishedAt: "desc" } },
      },
    });
    if (!row) throw new PortalNotFoundError("Offering not found");
    return row;
  },

  async announcements(user: TelegramSessionUser) {
    if (isStudent(user)) return studentPortalService.announcements(user.id);
    const courseIds = (await lecturerCourses(user)).map((course) => course.offeringId);
    if (!courseIds.length) return [];
    return prisma.courseAnnouncement.findMany({
      where: { offeringId: { in: courseIds }, publishedAt: { not: null } },
      include: { offering: { include: { course: true } } },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    });
  },

  async results(user: TelegramSessionUser, offeringId?: string) {
    if (!isStudent(user)) throw new PortalAccessError("Student results are only available to the student account");
    const courses = await studentPortalService.courses(user.id);
    const selected = offeringId ? courses.filter((course) => course.offeringId === offeringId) : courses;
    if (offeringId && selected.length === 0) throw new PortalNotFoundError("Enrolled course not found");
    return Promise.all(selected.map((course) => studentPortalService.course(user.id, course.offeringId)));
  },

  async surveys(user: TelegramSessionUser) {
    if (!isStudent(user)) return [];
    const courses = await studentPortalService.courses(user.id);
    const details = await Promise.all(courses.map((course) => studentPortalService.course(user.id, course.offeringId)));
    return details.map((course) => ({
      offeringId: course.offeringId,
      courseCode: course.code,
      courseTitle: course.title,
      submitted: course.feedbackSubmitted,
      deepLink: `/telegram/surveys/${encodeURIComponent(course.offeringId)}`,
    }));
  },

  async submitSurvey(user: TelegramSessionUser, offeringId: string, input: CourseFeedbackInput) {
    if (!isStudent(user)) throw new PortalAccessError("Only students can submit course feedback");
    const result = await studentPortalService.submitFeedback(user.id, offeringId, input);
    await telegramIdentityStore.audit({
      identityId: user.identity.id,
      userId: user.id,
      telegramUserId: user.identity.telegramUserId,
      action: "course_feedback_submitted",
      resourceType: "Offering",
      resourceId: offeringId,
    });
    return result;
  },

  async attendance(user: TelegramSessionUser, offeringId: string, date: string) {
    await assertOfferingAccess(user, offeringId);
    return attendanceService.get(offeringId, date);
  },

  async saveAttendance(user: TelegramSessionUser, offeringId: string, date: string, input: Parameters<typeof attendanceService.save>[2]) {
    await assertOfferingAccess(user, offeringId, true);
    const result = await attendanceService.save(offeringId, date, input);
    await telegramIdentityStore.audit({
      identityId: user.identity.id,
      userId: user.id,
      telegramUserId: user.identity.telegramUserId,
      action: "attendance_saved",
      resourceType: "Offering",
      resourceId: offeringId,
      metadata: { date, recordCount: input.records.length },
    });
    return result;
  },
};
