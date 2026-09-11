import type {
  AttendanceStatus,
  PortalCourseAchievementBadge,
  PortalCourseAchievementSummary,
  PortalCourseAttendanceSummary,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import { calculateCourseGrade, type CourseGradeSummary } from "./assessment-calculation.ts";

export class CourseAchievementAccessError extends Error {}

type AttendanceCounts = Record<AttendanceStatus, number> & {
  PermissionPending: number;
};

type AttendanceHealthSummary = {
  offeringId: string;
  history: {
    totalSessions: number;
    markedSessions: number;
    attendanceRate: number | null;
    counts: AttendanceCounts;
  };
  sessions: PortalCourseAttendanceSummary["sessions"];
};

interface OfferingsAchievementReadContract {
  studentAttendanceHistory: {
    healthForStudentOfferings(
      studentId: string,
      offeringIds: string[],
    ): Promise<AttendanceHealthSummary[]>;
  };
}

const EMPTY_COUNTS: AttendanceCounts = {
  Present: 0,
  Absent: 0,
  Late: 0,
  Excused: 0,
  PermissionPending: 0,
};

const EMPTY_ATTENDANCE: PortalCourseAttendanceSummary = {
  totalSessions: 0,
  markedSessions: 0,
  attendanceRate: null,
  sessions: [],
};

function roundedRate(value: number): number {
  return Math.round(value * 100) / 100;
}

function milestoneProgress(
  eligibleSessions: number,
  minimumSessions: number,
  attendanceRate: number | null,
  requiredRate: number,
): number {
  const sessionProgress = Math.min(1, eligibleSessions / minimumSessions);
  const rateProgress = Math.min(1, (attendanceRate ?? 0) / requiredRate);
  return Math.round(Math.min(sessionProgress, rateProgress) * 100);
}

function badge(
  kind: PortalCourseAchievementBadge["kind"],
  title: string,
  achieved: boolean,
  progress: number,
  detail: string,
): PortalCourseAchievementBadge {
  return { kind, title, achieved, progress, detail };
}

export function deriveCourseAchievementSummary(input: {
  offeringId: string;
  counts?: AttendanceCounts;
  attendance?: PortalCourseAttendanceSummary;
  finalizedGrade?: Pick<CourseGradeSummary, "complete" | "totalGrade">;
}): PortalCourseAchievementSummary {
  const counts = input.counts ?? EMPTY_COUNTS;

  // Motivational badge semantics intentionally differ from the official attendance
  // percentage only for approved/excused absences: Excused stays in the academic
  // record but is excluded from this badge denominator. Late still counts as attended.
  const eligibleAttendanceSessions = counts.Present + counts.Late + counts.Absent;
  const attendedSessions = counts.Present + counts.Late;
  const achievementAttendanceRate =
    eligibleAttendanceSessions === 0
      ? null
      : roundedRate((attendedSessions / eligibleAttendanceSessions) * 100);

  const greatStart =
    eligibleAttendanceSessions >= 3 &&
    (achievementAttendanceRate ?? 0) >= 90;
  const reliableLearner =
    eligibleAttendanceSessions >= 5 &&
    (achievementAttendanceRate ?? 0) >= 90;
  const perfectAttendance =
    eligibleAttendanceSessions >= 10 && achievementAttendanceRate === 100;

  const finalizedCourseGrade =
    input.finalizedGrade?.complete && input.finalizedGrade.totalGrade !== null
      ? input.finalizedGrade.totalGrade
      : null;
  const strongPerformance = (finalizedCourseGrade ?? -1) >= 85;
  const courseExcellence = strongPerformance && reliableLearner;

  const rateLabel =
    achievementAttendanceRate === null
      ? "No eligible attendance recorded yet"
      : `${achievementAttendanceRate}% achievement attendance`;
  const strongProgress =
    finalizedCourseGrade === null
      ? 0
      : Math.min(100, Math.round((finalizedCourseGrade / 85) * 100));
  const reliableProgress = milestoneProgress(
    eligibleAttendanceSessions,
    5,
    achievementAttendanceRate,
    90,
  );

  return {
    offeringId: input.offeringId,
    eligibleAttendanceSessions,
    achievementAttendanceRate,
    finalizedCourseGrade,
    attendance: input.attendance ?? EMPTY_ATTENDANCE,
    badges: [
      badge(
        "great_start",
        "Great Start",
        greatStart,
        milestoneProgress(eligibleAttendanceSessions, 3, achievementAttendanceRate, 90),
        `${eligibleAttendanceSessions}/3 eligible classes · ${rateLabel}`,
      ),
      badge(
        "reliable_learner",
        "Reliable Learner",
        reliableLearner,
        reliableProgress,
        `${eligibleAttendanceSessions}/5 eligible classes · ${rateLabel}`,
      ),
      badge(
        "perfect_attendance",
        "Perfect Attendance",
        perfectAttendance,
        milestoneProgress(eligibleAttendanceSessions, 10, achievementAttendanceRate, 100),
        `${eligibleAttendanceSessions}/10 eligible classes · ${rateLabel}`,
      ),
      badge(
        "strong_performance",
        "Strong Performance",
        strongPerformance,
        strongProgress,
        finalizedCourseGrade === null
          ? "Complete finalized course results required"
          : `${finalizedCourseGrade}% finalized course grade`,
      ),
      badge(
        "course_excellence",
        "Course Excellence",
        courseExcellence,
        Math.min(reliableProgress, strongProgress),
        "Reliable attendance + strong finalized performance",
      ),
    ],
  };
}

export const courseAchievementService = {
  async list(userId: string): Promise<PortalCourseAchievementSummary[]> {
    const student = await prisma.student.findUnique({
      where: { userId },
      select: { id: true, studentId: true, email: true, status: true },
    });
    if (
      !student ||
      student.status !== "Active" ||
      !student.studentId ||
      !student.email
    ) {
      throw new CourseAchievementAccessError(
        "No active student portal profile is linked to this account",
      );
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: student.id },
      select: {
        offeringId: true,
        offering: {
          select: {
            courseSpec: {
              select: {
                id: true,
                reviewStatus: true,
                assessmentItems: {
                  select: {
                    id: true,
                    status: true,
                    weight: true,
                    cloCodes: true,
                  },
                },
              },
            },
          },
        },
        results: {
          where: {
            publishedAt: { not: null },
            finalizedAt: { not: null },
          },
          select: {
            courseSpecId: true,
            assessmentItemId: true,
            score: true,
            maxScore: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const offeringIds = enrollments.map((enrollment) => enrollment.offeringId);
    const offerings = registry.get<OfferingsAchievementReadContract>("offerings").service;
    const attendance =
      await offerings.studentAttendanceHistory.healthForStudentOfferings(
        student.id,
        offeringIds,
      );
    const attendanceByOffering = new Map(
      attendance.map((summary) => [summary.offeringId, summary]),
    );

    return enrollments.map((enrollment) => {
      const spec = enrollment.offering.courseSpec;
      let finalizedGrade: Pick<CourseGradeSummary, "complete" | "totalGrade"> = {
        complete: false,
        totalGrade: null,
      };

      if (spec?.reviewStatus === "Approved") {
        finalizedGrade = calculateCourseGrade(
          spec.assessmentItems,
          enrollment.results
            .filter((result) => result.courseSpecId === spec.id)
            .map((result) => ({
              assessmentItemId: result.assessmentItemId,
              score: result.score,
              maxScore: result.maxScore,
            })),
        );
      }

      const attendanceSummary = attendanceByOffering.get(enrollment.offeringId);
      return deriveCourseAchievementSummary({
        offeringId: enrollment.offeringId,
        counts: attendanceSummary?.history.counts,
        attendance: attendanceSummary
          ? {
              totalSessions: attendanceSummary.history.totalSessions,
              markedSessions: attendanceSummary.history.markedSessions,
              attendanceRate: attendanceSummary.history.attendanceRate,
              sessions: attendanceSummary.sessions,
            }
          : undefined,
        finalizedGrade,
      });
    });
  },
};
