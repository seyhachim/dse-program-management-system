import type {
  ClassResponsibilityView,
  ClassSessionStatusView,
  CourseFeedbackInput,
  LecturerArrivalConfirmationView,
  SaveAttendanceInput,
  TelegramCourseCard,
  TelegramStudentToday,
  TelegramTodayClass,
} from "@dse-pms/shared-types";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";
import { registry } from "../../core/plugins/registry.ts";
import { telegramIdentityStore } from "./identity-store.ts";
import type { TelegramSessionUser } from "./session.ts";

const WIDE_ROLES: Role[] = ["admin", "program_coordinator", "program_secretary"];
const DSE_TIME_ZONE = "Asia/Phnom_Penh";
const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

class TelegramMiniNotFoundError extends Error {}
class TelegramMiniAccessError extends Error {}

interface PortalCourse {
  offeringId: string;
  code: string;
  title: string;
  term: string;
  sectionCode: string;
  lifecycle?: "planned" | "current" | "historical";
  lecturer?: { id: string; name: string } | null;
  coLecturers?: Array<{ id: string; name: string }>;
  meetings: Array<{
    id: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    room: string | null;
    activityType: string;
  }>;
  assessments?: Array<{ result: unknown | null }>;
  feedbackSubmitted?: boolean;
}

type MeetingSummary = Pick<
  PortalCourse["meetings"][number],
  "dayOfWeek" | "startTime" | "endTime" | "room" | "activityType"
>;

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
  classResponsibilities: {
    getActiveForUser(userId: string, offeringId: string): Promise<ClassResponsibilityView | null>;
  };
  classDelivery: {
    getLecturerArrival(offeringId: string, date: string): Promise<LecturerArrivalConfirmationView | null>;
    getClassSessionStatus(offeringId: string, date: string): Promise<ClassSessionStatusView | null>;
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

function nextMeeting(meetings: MeetingSummary[] = []) {
  const meeting = meetings[0];
  return meeting ? {
    dayOfWeek: meeting.dayOfWeek,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    room: meeting.room,
    activityType: meeting.activityType,
  } : null;
}

function studentCourseCards(courses: PortalCourse[]) {
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

async function studentCourses(userId: string) {
  return studentCourseCards(await portal().courses(userId));
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

function requiredPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Could not resolve ${type} in DSE timezone`);
  return value;
}

export function dseCalendarContext(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DSE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const year = requiredPart(parts, "year");
  const month = requiredPart(parts, "month");
  const day = requiredPart(parts, "day");
  const hour = requiredPart(parts, "hour");
  const minute = requiredPart(parts, "minute");
  return {
    date: `${year}-${month}-${day}`,
    dayOfWeek: requiredPart(parts, "weekday"),
    localTime: `${hour}:${minute}`,
  };
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function lecturerNames(course: PortalCourse) {
  return Array.from(new Set([
    ...(course.lecturer?.name ? [course.lecturer.name] : []),
    ...(course.coLecturers ?? []).map((lecturer) => lecturer.name).filter(Boolean),
  ]));
}

function staticMeeting(
  course: PortalCourse,
  meeting: PortalCourse["meetings"][number],
  date: string,
): TelegramTodayClass {
  return {
    meetingId: meeting.id,
    offeringId: course.offeringId,
    courseCode: course.code,
    courseTitle: course.title,
    sectionCode: course.sectionCode,
    date,
    dayOfWeek: meeting.dayOfWeek,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    room: meeting.room,
    activityType: meeting.activityType,
    lecturerNames: lecturerNames(course),
    arrivalStatus: null,
    arrivalRecordedAt: null,
    sessionStatus: "Scheduled",
    canConfirmLecturerArrival: false,
  };
}

export async function buildStudentToday(
  userId: string,
  courses: PortalCourse[],
  offeringService: OfferingsContract,
  now = new Date(),
): Promise<TelegramStudentToday> {
  const calendar = dseCalendarContext(now);
  const currentCourses = courses.filter((course) => course.lifecycle == null || course.lifecycle === "current");
  const todayMeetings = currentCourses
    .flatMap((course) =>
      course.meetings
        .filter((meeting) => meeting.dayOfWeek === calendar.dayOfWeek)
        .map((meeting) => ({ course, meeting })),
    )
    .sort((a, b) => a.meeting.startTime.localeCompare(b.meeting.startTime));

  const classes = await Promise.all(todayMeetings.map(async ({ course, meeting }) => {
    const [confirmation, session, responsibility] = await Promise.all([
      offeringService.classDelivery.getLecturerArrival(course.offeringId, calendar.date),
      offeringService.classDelivery.getClassSessionStatus(course.offeringId, calendar.date),
      offeringService.classResponsibilities.getActiveForUser(userId, course.offeringId),
    ]);
    const sessionStatus = session?.status ?? "Scheduled";
    return {
      ...staticMeeting(course, meeting, calendar.date),
      arrivalStatus: confirmation?.status ?? null,
      arrivalRecordedAt: confirmation?.recordedAt ?? null,
      sessionStatus,
      canConfirmLecturerArrival: Boolean(responsibility) && sessionStatus === "Scheduled",
    } satisfies TelegramTodayClass;
  }));

  let nextClass: TelegramTodayClass | null = null;
  if (classes.length === 0) {
    const todayIndex = WEEK_DAYS.indexOf(calendar.dayOfWeek as (typeof WEEK_DAYS)[number]);
    const candidates = currentCourses.flatMap((course) =>
      course.meetings.flatMap((meeting) => {
        const targetIndex = WEEK_DAYS.indexOf(meeting.dayOfWeek as (typeof WEEK_DAYS)[number]);
        if (todayIndex < 0 || targetIndex < 0) return [];
        let offset = (targetIndex - todayIndex + 7) % 7;
        if (offset === 0) offset = 7;
        return [{ offset, course, meeting }];
      }),
    ).sort((a, b) => a.offset - b.offset || a.meeting.startTime.localeCompare(b.meeting.startTime));
    const candidate = candidates[0];
    if (candidate) {
      nextClass = staticMeeting(
        candidate.course,
        candidate.meeting,
        addCalendarDays(calendar.date, candidate.offset),
      );
    }
  }

  return {
    date: calendar.date,
    dayOfWeek: calendar.dayOfWeek,
    localTime: calendar.localTime,
    classes,
    nextClass,
  };
}

export const telegramMiniAppService = {
  async courses(user: TelegramSessionUser) {
    return isStudent(user) ? studentCourses(user.id) : lecturerCourses(user);
  },

  async home(user: TelegramSessionUser) {
    let courses: TelegramCourseCard[];
    let today: TelegramStudentToday | null = null;
    let unreadAnnouncements = 0;
    let publishedResultCount = 0;
    let surveyActions = 0;
    if (isStudent(user)) {
      const portalCourses = await portal().courses(user.id);
      courses = studentCourseCards(portalCourses);
      const [announcements, details, studentToday] = await Promise.all([
        portal().announcements(user.id),
        Promise.all(courses.map((course) => portal().course(user.id, course.offeringId))),
        buildStudentToday(user.id, portalCourses, offerings()),
      ]);
      unreadAnnouncements = announcements.length;
      publishedResultCount = details.reduce(
        (sum, course) => sum + (course.assessments ?? []).filter((assessment) => assessment.result).length,
        0,
      );
      surveyActions = details.filter((course) => !course.feedbackSubmitted).length;
      today = studentToday;
    } else {
      courses = await lecturerCourses(user);
    }
    return {
      user: { id: user.id, name: user.name, email: user.email, roles: user.roles },
      courses,
      today,
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
