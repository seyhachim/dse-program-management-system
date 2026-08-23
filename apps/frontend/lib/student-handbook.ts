import type {
  AssignStudentHandbookLecturerInput,
  CreateStudentHandbookInput,
  SaveStudentHandbookSectionInput,
  StudentHandbookReviewInput,
  StudentHandbookSourceKind,
  StudentHandbookSourcePreview,
  StudentHandbookView,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const studentHandbookApi = {
  list: (programmeId = "dse") =>
    api.get<StudentHandbookView[]>(
      `/api/student-handbook?programmeId=${encodeURIComponent(programmeId)}`,
    ),
  get: (handbookId: string) =>
    api.get<StudentHandbookView>(`/api/student-handbook/${handbookId}`),
  create: (input: CreateStudentHandbookInput) =>
    api.post<StudentHandbookView>("/api/student-handbook", input),
  assign: (handbookId: string, input: AssignStudentHandbookLecturerInput) =>
    api.patch<StudentHandbookView>(
      `/api/student-handbook/${handbookId}/assignment`,
      input,
    ),
  saveSection: (
    handbookId: string,
    sectionKey: string,
    input: SaveStudentHandbookSectionInput,
  ) =>
    api.put<StudentHandbookView>(
      `/api/student-handbook/${handbookId}/sections/${encodeURIComponent(sectionKey)}`,
      input,
    ),
  source: (handbookId: string, kind: StudentHandbookSourceKind) =>
    api.get<StudentHandbookSourcePreview>(
      `/api/student-handbook/${handbookId}/sources/${kind}`,
    ),
  submit: (handbookId: string) =>
    api.post<StudentHandbookView>(`/api/student-handbook/${handbookId}/submit`, {}),
  requestChanges: (handbookId: string, input: StudentHandbookReviewInput) =>
    api.post<StudentHandbookView>(
      `/api/student-handbook/${handbookId}/request-changes`,
      input,
    ),
  approve: (handbookId: string, input: StudentHandbookReviewInput) =>
    api.post<StudentHandbookView>(
      `/api/student-handbook/${handbookId}/approve`,
      input,
    ),
  publish: (handbookId: string, input: StudentHandbookReviewInput) =>
    api.post<StudentHandbookView>(
      `/api/student-handbook/${handbookId}/publish`,
      input,
    ),
};
