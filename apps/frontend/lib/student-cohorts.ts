import type {
  AddStudentCohortMembershipInput,
  ApplyStudentPromotionInput,
  PreviewStudentPromotionInput,
  Student,
  StudentCohortSummaryView,
  StudentPromotionApplyResult,
  StudentPromotionPreview,
} from "@dse-pms/shared-types";
import { api } from "./api";

const COHORTS_API = "/api/students/cohorts";

export interface StudentCohortMembershipView {
  id: string;
  cohortId: string;
  studentId: string;
  joinedAt: string;
  exitedAt: string | null;
  exitReason: string | null;
  note: string;
  createdAt: string;
  student: Student;
}

export interface StudentCohortDetailView {
  id: string;
  programmeId: string;
  code: string;
  name: string;
  intakeYear: number;
  expectedGraduationYear: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  memberships: StudentCohortMembershipView[];
}

export const studentCohortsApi = {
  list(programmeId: string): Promise<StudentCohortSummaryView[]> {
    const qs = new URLSearchParams({ programmeId });
    return api.get<StudentCohortSummaryView[]>(`${COHORTS_API}?${qs.toString()}`);
  },

  get(cohortId: string): Promise<StudentCohortDetailView> {
    return api.get<StudentCohortDetailView>(`${COHORTS_API}/${encodeURIComponent(cohortId)}`);
  },

  addMembership(
    cohortId: string,
    input: AddStudentCohortMembershipInput,
  ): Promise<StudentCohortMembershipView> {
    return api.post<StudentCohortMembershipView>(
      `${COHORTS_API}/${encodeURIComponent(cohortId)}/memberships`,
      input,
    );
  },

  previewPromotion(cohortId: string, input: PreviewStudentPromotionInput): Promise<StudentPromotionPreview> {
    return api.post<StudentPromotionPreview>(`${COHORTS_API}/${cohortId}/promotion/preview`, input);
  },

  applyPromotion(cohortId: string, input: ApplyStudentPromotionInput): Promise<StudentPromotionApplyResult> {
    return api.post<StudentPromotionApplyResult>(`${COHORTS_API}/${cohortId}/promotion/apply`, input);
  },
};
