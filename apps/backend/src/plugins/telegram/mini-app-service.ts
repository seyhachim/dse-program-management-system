import type { CourseFeedbackInput, SaveAttendanceInput } from "@dse-pms/shared-types";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { registry } from "../../core/plugins/registry.ts";
import { telegramIdentityStore } from "./identity-store.ts";
import type { TelegramSessionUser } from "./session.ts";

const WIDE_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];

class TelegramMiniNotFoundError extends Error {}
class TelegramMiniAccessError extends Error {}

interface PortalCourse {
  offeringId: string;
  code: string;
  title: string;
  term: string;
  sectionCode: string;
  meetings: Array<{
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    room: string | null;
    activityType: string;
  }>;
  assessments?: Array<{ result: unknown | null }>;
  feedbackSubmitted?: boolean;
}

interface DeliveryOffering {
  offeringId: string;
  code: string;
  title: string;
  term: string;
  sectionCode: string;
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    pinned: boolean;
    publishedAt: string | null;
  }>;
}

interface StudentPortalContract {
  courses(userId: string): Promise<PortalCourse[]>;
  course(userId: string, offeringId: string): Promise<PortalCourse & Record<string, unknown>>;
  announcements(userId: string): Promise<Array<Record<string, unknown>>>;
  deliveryOfferings(userId: string, programmeWide: boolean): Promise<DeliveryOffering[]>;
  submitFeedback(userId: string, offeringId: string, input: CourseFeedbackInput): Promise<{ submitted: boolean }>;
}

interface OfferingView {
  id: string;
  term: string;
  sectionCode: string;
  course?: { programmeId?: string | null; code?: string; title?: string } | null;
  lecturer?: { id: string } | null;
  coLecturers: Array<{ id: string }>;
  meetings?: Array<{
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    room: string | null;
    activityType: string;
  }>;
}

interface OfferingsContract {
  getById(id: string): Promise<OfferingView | null>;
  attendance: {
    get(offeringId: string, date: string): Promise<unknown>;
    save(offeringId: string, date: string, input: SaveAttendanceInput): Promise<unknown>;
  };
}

function portal() {
  return registry.get<StudentPortalContract>("student-portal").service;
}

function offerings() {
  return registry.get<OfferingsContract>("offerings").service;
}

function authUser(user: TelegramSessionUser): AuthUser {
  return { id: user.id, email: user.email, roles: user.roles, programmeRoles: user.programmeRoles };
}

function isStudent(user: TelegramSessionUser) {
  return user.roles.includes("student");
}

async function assertOfferingAccess(user: TelegramSessionUser, offeringId: string, write = false) {
  const offering = await offerings().getById(offeringId);
  if (!offering) throw new TelegramMiniNotFoundError("Offering not found");
  const programmeId = offering.course?.programmeId ?? null;
  const assigned = offering.lecturer?.id === user.id || offering.coLecturers.some((item) => item.id === user.id);
  const programmeWide = hasAnyRoleInProgramme(authUser(user), WIDE_ROLES, programmeId);
  if (!assigned && !programmeWide) {
    throw new TelegramMiniAccessError(
      write ? "You can only change attendance for your own offerings" : "You cannot access this offering",
    );
  }
  return offering;
}

function nextMeeting(meetings: PortalCourse["meetings"] = []) {
  const meeting = meetings[0];
  return meeting ? {
    dayOfWeek: meeting.dayOfWeek,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    room: meeting.room,
    activityType: meeting.activityType,
  } : null;
}

async function studentCourses(userId: string) {
  return (await portal().courses(userId)).map((course) => ({
    offeringId: course.offeringId,
    courseCode: course.code,
    courseTitle: course.title,
    sectionCode: course.sectionCode,
    term: course.term,
    role: "student" as const,
    nextMeeting: nextMeeting(course.meetings),
  }));
}

async function lecturerDelivery(user: TelegramSessionUser) {
  const flatWide = user.roles.some((role) => WIDE_ROLES.includes(role));
  const candidates = await portal().deliveryOfferings(user.id, flatWide);
  const accepted: Array<{ delivery: DeliveryOffering; offering: OfferingView }> = [];
  for (const delivery of candidates) {
    const offering = await offerings().getById(delivery.offeringId);
    if (!offering) continue;
    const programmeWide = hasAnyRoleInProgramme(
      authUser(user),
      WIDE_ROLES,
      offering.course?.programmeId ?? null,
    );
    const assigned = offering.lecturer?.id === user.id || offering.coLecturers.some((item) => item.id === user.id);
    if (programmeWide || assigned) accepted.push({ delivery, offering });
  }
  return accepted;
}

async function lecturerCourses(user: TelegramSessionUser) {
  const items = await lecturerDelivery(user);
  return items.map(({ delivery, offering }) => ({
    offeringId: delivery.offeringId,
    courseCode: delivery.code,
    courseTitle: delivery.title,
    sectionCode: delivery.sectionCode,
    term: delivery.term,
    role: "lecturer" as const,
    nextMeeting: nextMeeting(offering.meetings ?? []),
  }));
}

export const telegramMiniAppService = {
  async courses(user: TelegramSessionUser) {
    return isStudent(user) ? studentCourses(user.id) : lecturerCourses(user);
  },

  async home(user: TelegramSessionUser) {
    const courses = await this.courses(user);
    let unreadAnnouncements = 0;
    let publishedResultCount = 0;
    let surveyActions = 0;
    if (isStudent(user)) {
      const [announcements, details] = await Promise.all([
        portal().announcements(user.id),
        Promise.all(courses.map((course) => portal().course(user.id, course.offeringId))),
      ]);
      unreadAnnouncements = announcements.length;
      publishedResultCount = details.reduce(
        (sum, course) => sum + (course.assessments ?? []).filter((assessment) => assessment.result).length,
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
    if (isStudent(user)) return portal().course(user.id, offeringId);
    return assertOfferingAccess(user, offeringId);
  },

  async announcements(user: TelegramSessionUser) {
    if (isStudent(user)) return portal().announcements(user.id);
    const items = await lecturerDelivery(user);
    return items.flatMap(({ delivery }) => delivery.announcements.map((announcement) => ({
      ...announcement,
      offeringId: delivery.offeringId,
      courseCode: delivery.code,
      courseTitle: delivery.title,
    })));
  },

  async results(user: TelegramSessionUser, offeringId?: string) {
    if (!isStudent(user)) throw new TelegramMiniAccessError("Student results are only available to the student account");
    const courses = await portal().courses(user.id);
    const selected = offeringId ? courses.filter((course) => course.offeringId === offeringId) : courses;
    if (offeringId && selected.length === 0) throw new TelegramMiniNotFoundError("Enrolled course not found");
    return Promise.all(selected.map((course) => portal().course(user.id, course.offeringId)));
  },

  async surveys(user: TelegramSessionUser) {
    if (!isStudent(user)) return [];
    const courses = await portal().courses(user.id);
    const details = await Promise.all(courses.map((course) => portal().course(user.id, course.offeringId)));
    return details.map((course) => ({
      offeringId: course.offeringId,
      courseCode: course.code,
      courseTitle: course.title,
      submitted: Boolean(course.feedbackSubmitted),
      deepLink: `/telegram/surveys/${encodeURIComponent(course.offeringId)}`,
    }));
  },

  async submitSurvey(user: TelegramSessionUser, offeringId: string, input: CourseFeedbackInput) {
    if (!isStudent(user)) throw new TelegramMiniAccessError("Only students can submit course feedback");
    const result = await portal().submitFeedback(user.id, offeringId, input);
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
    return offerings().attendance.get(offeringId, date);
  },

  async saveAttendance(user: TelegramSessionUser, offeringId: string, date: string, input: SaveAttendanceInput) {
    await assertOfferingAccess(user, offeringId, true);
    const result = await offerings().attendance.save(offeringId, date, input);
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

export function telegramMiniErrorStatus(error: unknown): number | null {
  if (error instanceof TelegramMiniNotFoundError) return 404;
  if (error instanceof TelegramMiniAccessError) return 403;
  return null;
}
