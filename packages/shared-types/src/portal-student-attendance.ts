import type { AttendanceStatus } from "./attendance.ts";

export interface PortalStudentAttendanceHistoryItem {
  date: string;
  status: AttendanceStatus | null;
  permissionPending: boolean;
  updatedAt: string;
}

export interface PortalStudentAttendanceHistory {
  offeringId: string;
  totalSessions: number;
  markedSessions: number;
  attendanceRate: number | null;
  counts: Record<AttendanceStatus, number> & { PermissionPending: number };
  history: PortalStudentAttendanceHistoryItem[];
}
