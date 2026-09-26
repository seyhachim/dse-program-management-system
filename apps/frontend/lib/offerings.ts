import type {
  AttendanceSessionSummary,
  AttendanceSessionView,
  AttendanceStudentHistoryView,
  ClassResponsibilityRole,
  ClassResponsibilityView,
  CreateOfferingInput,
  LecturerWorkloadSummary,
  OfferingStatus,
  OfferingView,
  RecheckAttendanceInput,
  SaveAttendanceInput,
  UpdateOfferingInput,
} from "@dse-pms/shared-types";
import { ApiError, api } from "./api";

export const ATTENDANCE_SAVE_TIMEOUT_MS = 65_000;

type AttendancePut = <T>(path: string, body: unknown, signal?: AbortSignal) => Promise<T>;

export async function saveAttendanceWithTimeout(
  id: string,
  date: string,
  input: SaveAttendanceInput,
  timeoutMs = ATTENDANCE_SAVE_TIMEOUT_MS,
  put: AttendancePut = api.put,
): Promise<AttendanceSessionView> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await put<AttendanceSessionView>(
      `/api/offerings/${id}/attendance/${encodeURIComponent(date)}`,
      input,
      controller.signal,
    );
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(
        504,
        "Attendance save response timed out. Your marks remain on this device, but the server may have saved them. Check this date in another tab before retrying.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const offeringsApi = {
  list(): Promise<OfferingView[]> {
    return api.get<OfferingView[]>("/api/offerings");
  },
  workload(term?: string): Promise<LecturerWorkloadSummary> {
    const query = term ? `?term=${encodeURIComponent(term)}` : "";
    return api.get<LecturerWorkloadSummary>(`/api/offerings/workload/me${query}`);
  },
  get(id: string): Promise<OfferingView> {
    return api.get<OfferingView>(`/api/offerings/${id}`);
  },
  create(input: CreateOfferingInput): Promise<OfferingView> {
    return api.post<OfferingView>("/api/offerings", input);
  },
  update(id: string, input: UpdateOfferingInput): Promise<OfferingView> {
    return api.patch<OfferingView>(`/api/offerings/${id}`, input);
  },
  remove(id: string): Promise<void> {
    return api.delete<void>(`/api/offerings/${id}`);
  },
  enroll(id: string, studentIds: string[]): Promise<OfferingView> {
    return api.post<OfferingView>(`/api/offerings/${id}/enrollments`, { studentIds });
  },
  unenroll(id: string, studentId: string): Promise<OfferingView> {
    return api.delete<OfferingView>(`/api/offerings/${id}/enrollments/${studentId}`);
  },
  responsibilities(id: string): Promise<ClassResponsibilityView[]> {
    return api.get<ClassResponsibilityView[]>(`/api/offerings/${id}/responsibilities`);
  },
  assignResponsibility(
    id: string,
    studentId: string,
    role: ClassResponsibilityRole,
  ): Promise<ClassResponsibilityView> {
    return api.post<ClassResponsibilityView>(`/api/offerings/${id}/responsibilities`, {
      studentId,
      role,
    });
  },
  attendanceSessions(id: string): Promise<AttendanceSessionSummary[]> {
    return api.get<AttendanceSessionSummary[]>(`/api/offerings/${id}/attendance`);
  },
  attendance(id: string, date: string): Promise<AttendanceSessionView> {
    return api.get<AttendanceSessionView>(`/api/offerings/${id}/attendance/${encodeURIComponent(date)}`);
  },
  async saveAttendance(id: string, date: string, input: SaveAttendanceInput): Promise<AttendanceSessionView> {
    return saveAttendanceWithTimeout(id, date, input);
  },
  recheckAttendance(
    id: string,
    date: string,
    input: RecheckAttendanceInput,
  ): Promise<AttendanceSessionView> {
    return api.post<AttendanceSessionView>(
      `/api/offerings/${id}/attendance/${encodeURIComponent(date)}/recheck`,
      input,
    );
  },
  attendanceStudentHistory(id: string, studentId: string): Promise<AttendanceStudentHistoryView> {
    return api.get<AttendanceStudentHistoryView>(
      `/api/offerings/${id}/attendance/students/${encodeURIComponent(studentId)}/history`,
    );
  },
};

export function workloadForTerm(
  summary: LecturerWorkloadSummary,
  term: string | null,
): LecturerWorkloadSummary {
  const scheduleRows = term
    ? summary.scheduleRows.filter((row) => row.term === term)
    : summary.scheduleRows;
  const rows = term ? summary.rows.filter((row) => row.term === term) : summary.rows;
  const weeklyTotals = term
    ? summary.weeklyTotals.filter((week) => week.term === term)
    : summary.weeklyTotals;
  return {
    scheduleRows,
    scheduledWeeklyHours:
      Math.round(scheduleRows.reduce((total, row) => total + row.durationHours, 0) * 100) / 100,
    rows,
    weeklyTotals,
    peakWeeklyHours: Math.max(0, ...weeklyTotals.map((week) => week.totalContactHours)),
    totalHours: rows.reduce((total, row) => total + row.totalContactHours, 0),
    coLecturerAssumption: "full",
  };
}

export function offeringTone(status: OfferingStatus): "live" | "upcoming" | "neutral" {
  if (status === "Active") return "live";
  if (status === "Planned") return "upcoming";
  return "neutral";
}
