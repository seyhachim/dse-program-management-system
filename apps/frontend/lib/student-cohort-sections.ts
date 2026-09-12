import type {
  AddStudentCohortSectionMembershipInput,
  CreateStudentCohortSectionInput,
  ExitStudentCohortSectionMembershipInput,
  StudentCohortSectionMemberView,
  StudentCohortSectionMembershipView,
  StudentCohortSectionView,
  UpdateStudentCohortSectionInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

const SECTIONS_API = "/api/students/cohort-sections";

export interface StudentCohortSectionHistoryView extends StudentCohortSectionMembershipView {
  studentNumber: string;
  studentName: string;
}

export const studentCohortSectionsApi = {
  list(cohortId: string, activeOnly = false): Promise<StudentCohortSectionView[]> {
    const qs = new URLSearchParams({ cohortId, activeOnly: String(activeOnly) });
    return api.get<StudentCohortSectionView[]>(`${SECTIONS_API}?${qs.toString()}`);
  },

  create(input: CreateStudentCohortSectionInput): Promise<StudentCohortSectionView> {
    return api.post<StudentCohortSectionView>(SECTIONS_API, input);
  },

  update(sectionId: string, input: UpdateStudentCohortSectionInput): Promise<StudentCohortSectionView> {
    return api.patch<StudentCohortSectionView>(`${SECTIONS_API}/${encodeURIComponent(sectionId)}`, input);
  },

  members(cohortId: string): Promise<StudentCohortSectionMemberView[]> {
    return api.get<StudentCohortSectionMemberView[]>(`${SECTIONS_API}/${encodeURIComponent(cohortId)}/members`);
  },

  history(cohortId: string): Promise<StudentCohortSectionHistoryView[]> {
    return api.get<StudentCohortSectionHistoryView[]>(`${SECTIONS_API}/${encodeURIComponent(cohortId)}/history`);
  },

  addMembership(
    sectionId: string,
    input: AddStudentCohortSectionMembershipInput,
  ): Promise<StudentCohortSectionMembershipView> {
    return api.post<StudentCohortSectionMembershipView>(
      `${SECTIONS_API}/${encodeURIComponent(sectionId)}/memberships`,
      input,
    );
  },

  exitMembership(
    sectionId: string,
    membershipId: string,
    input: ExitStudentCohortSectionMembershipInput,
  ): Promise<StudentCohortSectionMembershipView> {
    return api.post<StudentCohortSectionMembershipView>(
      `${SECTIONS_API}/${encodeURIComponent(sectionId)}/memberships/${encodeURIComponent(membershipId)}/exit`,
      input,
    );
  },
};
