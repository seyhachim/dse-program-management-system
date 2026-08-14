import type {
  CreateOfferingInput,
  LecturerWorkloadSummary,
  OfferingStatus,
  OfferingView,
  UpdateOfferingInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

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
};

/** Apply the My Courses term selection to a server-provided workload summary. */
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
    coLecturerAssumption: summary.coLecturerAssumption,
  };
}

/** Map an offering status to a StatusBadge tone. */
export function offeringTone(status: OfferingStatus): "live" | "upcoming" | "neutral" {
  if (status === "Active") return "live";
  if (status === "Planned") return "upcoming";
  return "neutral";
}
