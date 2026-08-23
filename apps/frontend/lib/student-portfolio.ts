import type {
  StudentPortfolioEligibleAssessmentSource,
  StudentPortfolioEvidence,
  StudentPortfolioEvidenceCreateInput,
  StudentPortfolioEvidenceUpdateInput,
  StudentPortfolioProfile,
  StudentPortfolioProfileInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const studentPortfolioApi = {
  profile: () => api.get<StudentPortfolioProfile>("/api/student-portal/portfolio"),
  updateProfile: (input: StudentPortfolioProfileInput) =>
    api.put<StudentPortfolioProfile>("/api/student-portal/portfolio", input),
  evidence: () =>
    api.get<StudentPortfolioEvidence[]>("/api/student-portal/portfolio/evidence"),
  eligibleEvidenceSources: () =>
    api.get<StudentPortfolioEligibleAssessmentSource[]>(
      "/api/student-portal/portfolio/evidence/eligible-sources",
    ),
  createEvidence: (input: StudentPortfolioEvidenceCreateInput) =>
    api.post<StudentPortfolioEvidence>("/api/student-portal/portfolio/evidence", input),
  updateEvidence: (evidenceId: string, input: StudentPortfolioEvidenceUpdateInput) =>
    api.put<StudentPortfolioEvidence>(
      `/api/student-portal/portfolio/evidence/${evidenceId}`,
      input,
    ),
  deleteEvidence: (evidenceId: string) =>
    api.delete<void>(`/api/student-portal/portfolio/evidence/${evidenceId}`),
};

export function normalizeCareerInterests(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}
