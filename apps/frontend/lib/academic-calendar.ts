import type {
  AcademicCalendarAuditView,
  AcademicCalendarContextView,
  AcademicCalendarProgrammeRef,
  AcademicCalendarView,
  AcademicYearView,
  CreateAcademicCalendarInput,
  CreateAcademicYearInput,
  UpdateAcademicCalendarDraftInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

function base(programmeId: string): string {
  return `/api/programme/programmes/${encodeURIComponent(programmeId)}/academic-calendar`;
}

export const academicCalendarApi = {
  programme(): Promise<AcademicCalendarProgrammeRef> {
    return api.get<AcademicCalendarProgrammeRef>("/api/programme/academic-calendar/programme");
  },
  years(programmeId: string): Promise<AcademicYearView[]> {
    return api.get<AcademicYearView[]>(`${base(programmeId)}/years`);
  },
  createYear(programmeId: string, input: CreateAcademicYearInput): Promise<AcademicYearView> {
    return api.post<AcademicYearView>(`${base(programmeId)}/years`, input);
  },
  setCurrentYear(programmeId: string, academicYearId: string): Promise<AcademicYearView> {
    return api.put<AcademicYearView>(`${base(programmeId)}/years/${academicYearId}/current`, {});
  },
  calendars(programmeId: string, academicYearId: string): Promise<AcademicCalendarView[]> {
    return api.get<AcademicCalendarView[]>(`${base(programmeId)}/calendars?academicYearId=${encodeURIComponent(academicYearId)}`);
  },
  get(programmeId: string, calendarId: string): Promise<AcademicCalendarView> {
    return api.get<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}`);
  },
  create(programmeId: string, input: CreateAcademicCalendarInput): Promise<AcademicCalendarView> {
    return api.post<AcademicCalendarView>(`${base(programmeId)}/calendars`, input);
  },
  update(programmeId: string, calendarId: string, input: UpdateAcademicCalendarDraftInput): Promise<AcademicCalendarView> {
    return api.put<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}`, input);
  },
  publish(programmeId: string, calendarId: string): Promise<AcademicCalendarView> {
    return api.post<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}/publish`, {});
  },
  revision(programmeId: string, calendarId: string, reason: string): Promise<AcademicCalendarView> {
    return api.post<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}/revisions`, { reason });
  },
  archive(programmeId: string, calendarId: string): Promise<AcademicCalendarView> {
    return api.post<AcademicCalendarView>(`${base(programmeId)}/calendars/${calendarId}/archive`, {});
  },
  audit(programmeId: string, calendarId: string): Promise<AcademicCalendarAuditView[]> {
    return api.get<AcademicCalendarAuditView[]>(`${base(programmeId)}/calendars/${calendarId}/audit`);
  },
  context(programmeId: string, academicYearId: string, studyYear: number, semester: "First" | "Second"): Promise<AcademicCalendarContextView> {
    const query = new URLSearchParams({ academicYearId, studyYear: String(studyYear), semester });
    return api.get<AcademicCalendarContextView>(`${base(programmeId)}/context?${query.toString()}`);
  },
};

export function academicSemesterLabel(semester: "First" | "Second"): string {
  return semester === "First" ? "Semester 1" : "Semester 2";
}

export function formatAcademicDate(value: string | null | undefined): string {
  if (!value) return "Not set";
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}
