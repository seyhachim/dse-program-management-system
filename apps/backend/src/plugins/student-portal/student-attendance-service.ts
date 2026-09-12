import type {
  AttendanceStatus,
  PortalStudentAttendanceHistory,
} from "@dse-pms/shared-types";
import { registry } from "../../core/plugins/registry.ts";
import { studentPortalService } from "./service.ts";

type CanonicalAttendanceHistory = {
  offeringId: string;
  totalSessions: number;
  markedSessions: number;
  attendanceRate: number | null;
  counts: Record<AttendanceStatus, number> & { PermissionPending: number };
  history: Array<{
    sessionId: string;
    date: string;
    status: AttendanceStatus | null;
    permissionPending: boolean;
    permissionPendingSince: string | null;
    note: string;
    updatedAt: string;
  }>;
};

interface OfferingsAttendanceReadContract {
  studentAttendanceHistory: {
    forUser(userId: string, offeringId: string): Promise<CanonicalAttendanceHistory>;
  };
}

export function toPortalStudentAttendanceHistory(
  canonical: CanonicalAttendanceHistory,
): PortalStudentAttendanceHistory {
  return {
    offeringId: canonical.offeringId,
    totalSessions: canonical.totalSessions,
    markedSessions: canonical.markedSessions,
    attendanceRate: canonical.attendanceRate,
    counts: { ...canonical.counts },
    history: canonical.history.map((row) => ({
      date: row.date,
      status: row.status,
      permissionPending: row.permissionPending,
      updatedAt: row.updatedAt,
    })),
  };
}

export const studentPortalAttendanceService = {
  async forCourse(userId: string, offeringId: string): Promise<PortalStudentAttendanceHistory> {
    await studentPortalService.course(userId, offeringId);
    const offerings = registry.get<OfferingsAttendanceReadContract>("offerings").service;
    const canonical = await offerings.studentAttendanceHistory.forUser(userId, offeringId);
    return toPortalStudentAttendanceHistory(canonical);
  },
};
