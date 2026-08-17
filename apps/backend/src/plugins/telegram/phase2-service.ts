import type { LecturerWorkloadSummary } from "@dse-pms/shared-types";
import { registry } from "../../core/plugins/registry.ts";
import type { TelegramSessionUser } from "./session.ts";

class TelegramPhase2AccessError extends Error {}
class TelegramPhase2NotFoundError extends Error {}

interface PortalAssessment {
  id: string;
  name: string;
  dueAt: string | null;
  dueWeek: number | null;
  weight: number | null;
  result: unknown | null;
}

interface PortalCourseDetail {
  offeringId: string;
  code: string;
  title: string;
  sectionCode: string;
  assessments?: PortalAssessment[];
}

interface StudentPortalContract {
  courses(userId: string): Promise<Array<{ offeringId: string }>>;
  course(userId: string, offeringId: string): Promise<PortalCourseDetail>;
}

interface StudentAttendanceHistory {
  offeringId: string;
  studentId: string;
  studentNumber: string;
  totalSessions: number;
  markedSessions: number;
  attendanceRate: number | null;
  counts: { Present: number; Absent: number; Late: number; Excused: number };
  history: Array<{
    sessionId: string;
    date: string;
    status: "Present" | "Absent" | "Late" | "Excused" | null;
    note: string;
    updatedAt: string;
  }>;
}

interface OfferingsContract {
  workloadForLecturer(lecturerId: string, query: { term?: string }): Promise<LecturerWorkloadSummary>;
  studentAttendanceHistory: {
    forUser(userId: string, offeringId: string): Promise<StudentAttendanceHistory>;
  };
}

function portal() {
  return registry.get<StudentPortalContract>("student-portal").service;
}

function offerings() {
  return registry.get<OfferingsContract>("offerings").service;
}

function requireStudent(user: TelegramSessionUser) {
  if (!user.roles.includes("student")) throw new TelegramPhase2AccessError("This view is only available to students");
}

function requireLecturer(user: TelegramSessionUser) {
  if (!user.roles.includes("lecturer")) throw new TelegramPhase2AccessError("This view is only available to lecturers");
}

export const telegramPhase2Service = {
  async assessmentDeadlines(user: TelegramSessionUser) {
    requireStudent(user);
    const courses = await portal().courses(user.id);
    const details = await Promise.all(courses.map((course) => portal().course(user.id, course.offeringId)));
    const assessments = details.flatMap((course) =>
      (course.assessments ?? [])
        .filter((assessment) => !assessment.result)
        .map((assessment) => ({
          offeringId: course.offeringId,
          courseCode: course.code,
          courseTitle: course.title,
          sectionCode: course.sectionCode,
          assessmentId: assessment.id,
          name: assessment.name,
          dueAt: assessment.dueAt,
          dueWeek: assessment.dueWeek,
          weight: assessment.weight,
        })),
    ).sort((a, b) => {
      if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return (a.dueWeek ?? Number.MAX_SAFE_INTEGER) - (b.dueWeek ?? Number.MAX_SAFE_INTEGER);
    });
    return { assessments };
  },

  async attendanceHistory(user: TelegramSessionUser, offeringId: string) {
    requireStudent(user);
    try {
      return await offerings().studentAttendanceHistory.forUser(user.id, offeringId);
    } catch (error) {
      if (error instanceof Error && /not enrolled|not linked|not active/i.test(error.message)) {
        throw new TelegramPhase2NotFoundError("Attendance history is not available for this course");
      }
      throw error;
    }
  },

  async lecturerWorkload(user: TelegramSessionUser, term?: string) {
    requireLecturer(user);
    return offerings().workloadForLecturer(user.id, term ? { term } : {});
  },
};

export function telegramPhase2ErrorStatus(error: unknown): number | null {
  if (error instanceof TelegramPhase2AccessError) return 403;
  if (error instanceof TelegramPhase2NotFoundError) return 404;
  return null;
}
