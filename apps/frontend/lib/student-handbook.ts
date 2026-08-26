import type {
  AssignStudentHandbookLecturerInput,
  CreateStudentHandbookInput,
  CreateStudentHandbookSectionInput,
  RenameStudentHandbookSectionInput,
  ReorderStudentHandbookSectionsInput,
  SaveStudentHandbookSectionInput,
  StudentHandbookDocumentTheme,
  StudentHandbookReviewInput,
  StudentHandbookSourceKind,
  StudentHandbookSourcePreview,
  StudentHandbookView,
  UpdateStudentHandbookThemeInput,
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
  theme: (handbookId: string) =>
    api.get<StudentHandbookDocumentTheme>(`/api/student-handbook/${handbookId}/theme`),
  updateTheme: (handbookId: string, input: UpdateStudentHandbookThemeInput) =>
    api.put<StudentHandbookDocumentTheme>(`/api/student-handbook/${handbookId}/theme`, input),
  addSection: (handbookId: string, input: CreateStudentHandbookSectionInput) =>
    api.post<StudentHandbookView>(`/api/student-handbook/${handbookId}/sections`, input),
  renameSection: (
    handbookId: string,
    sectionId: string,
    input: RenameStudentHandbookSectionInput,
  ) =>
    api.patch<StudentHandbookView>(
      `/api/student-handbook/${handbookId}/sections/${sectionId}`,
      input,
    ),
  reorderSections: (handbookId: string, input: ReorderStudentHandbookSectionsInput) =>
    api.put<StudentHandbookView>(`/api/student-handbook/${handbookId}/sections-order`, input),
  deleteSection: (handbookId: string, sectionId: string) =>
    api.delete<StudentHandbookView>(`/api/student-handbook/${handbookId}/sections/${sectionId}`),
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
