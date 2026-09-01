import type {
  ParentAcademicProgressSummary,
  ParentAttendanceHealthState,
  ParentAttendanceSummary,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { registry } from "../../core/plugins/registry.ts";
import {
  GuardianRelationshipError,
  guardianRelationshipService,
} from "./service.ts";

type AttendanceCounts = ParentAttendanceSummary["counts"];

type OfferingsProjectionContract = {
  studentAttendanceHistory: {
    healthForStudent(studentId: string, offeringId: string): Promise<{
      history: {
        totalSessions: number;
        markedSessions: number;
        attendanceRate: number | null;
        counts: AttendanceCounts;
      };
      health: {
        state: ParentAttendanceHealthState;
        signals: Array<{
          kind: "attendance" | "punctuality";
          level: string;
          count: number;
        }>;
      };
    } | null>;
  };
};

type StudentPortalProjectionContract = {
  parentProjection: {
    forStudent(studentId: string, programmeId: string, includeOfficialResults: boolean): Promise<{
      academicStatus: ParentAcademicProgressSummary["academicStatus"];
      progressionStatus: string | null;
      academicYear: string | null;
      programmeYear: number | null;
      officialResults: ParentAcademicProgressSummary["officialResults"];
    }>;
  };
};

function emptyCounts(): AttendanceCounts {
  return { Present: 0, Absent: 0, Late: 0, Excused: 0, PermissionPending: 0 };
}

async function relationshipWithScope(
  guardianUserId: string,
  relationshipId: string,
  scope: "attendance" | "academic_status",
) {
  const relationship = (await guardianRelationshipService.listMine(guardianUserId))
    .find((item) => item.relationshipId === relationshipId);
  if (!relationship || !relationship.accessScopes.includes(scope)) {
    throw new GuardianRelationshipError(
      "FORBIDDEN",
      "Guardian access is not permitted for this relationship and scope",
    );
  }
  return relationship;
}

function aggregateHealthState(states: ParentAttendanceHealthState[]): ParentAttendanceHealthState {
  if (states.includes("warning")) return "warning";
  if (states.includes("watch")) return "watch";
  if (states.includes("recovery")) return "recovery";
  return "healthy";
}

export const parentProgressService = {
  async attendance(
    guardianUserId: string,
    relationshipId: string,
  ): Promise<ParentAttendanceSummary> {
    const relationship = await relationshipWithScope(guardianUserId, relationshipId, "attendance");
    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: relationship.studentId,
        offering: { course: { programmeId: relationship.programmeId } },
      },
      select: {
        offeringId: true,
        offering: {
          select: {
            course: { select: { code: true } },
          },
        },
      },
    });
    const offerings = registry.get<OfferingsProjectionContract>("offerings").service;
    const evaluations = await Promise.all(enrollments.map(async (enrollment) => ({
      enrollment,
      evaluation: await offerings.studentAttendanceHistory.healthForStudent(
        relationship.studentId,
        enrollment.offeringId,
      ),
    })));

    const counts = emptyCounts();
    let totalSessions = 0;
    let markedSessions = 0;
    const states: ParentAttendanceHealthState[] = [];
    const warnings: ParentAttendanceSummary["warnings"] = [];

    for (const { enrollment, evaluation } of evaluations) {
      if (!evaluation) continue;
      totalSessions += evaluation.history.totalSessions;
      markedSessions += evaluation.history.markedSessions;
      counts.Present += evaluation.history.counts.Present;
      counts.Absent += evaluation.history.counts.Absent;
      counts.Late += evaluation.history.counts.Late;
      counts.Excused += evaluation.history.counts.Excused;
      counts.PermissionPending += evaluation.history.counts.PermissionPending;
      states.push(evaluation.health.state);
      for (const signal of evaluation.health.signals) {
        if (signal.level !== "watch" && signal.level !== "warning") continue;
        warnings.push({
          offeringId: enrollment.offeringId,
          courseCode: enrollment.offering.course.code,
          kind: signal.kind,
          level: signal.level,
          count: signal.count,
          message: signal.kind === "attendance"
            ? `${evaluation.history.counts.Absent} absent · ${evaluation.history.counts.Excused} permission / excused.`
            : `${signal.count} consecutive late attendance records.`,
        });
      }
    }

    const attended = counts.Present + counts.Late;
    return {
      relationshipId,
      studentId: relationship.studentId,
      programmeId: relationship.programmeId,
      totalSessions,
      markedSessions,
      attendanceRate: markedSessions === 0
        ? null
        : Math.round((attended / markedSessions) * 10_000) / 100,
      counts,
      healthState: aggregateHealthState(states),
      warnings,
    };
  },

  async academicProgress(
    guardianUserId: string,
    relationshipId: string,
  ): Promise<ParentAcademicProgressSummary> {
    const relationship = await relationshipWithScope(
      guardianUserId,
      relationshipId,
      "academic_status",
    );
    const studentPortal = registry.get<StudentPortalProjectionContract>("student-portal").service;
    const projection = await studentPortal.parentProjection.forStudent(
      relationship.studentId,
      relationship.programmeId,
      relationship.accessScopes.includes("official_results"),
    );
    return {
      relationshipId,
      studentId: relationship.studentId,
      programmeId: relationship.programmeId,
      ...projection,
    };
  },
};
