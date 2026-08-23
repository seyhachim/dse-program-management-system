import type {
  PublicStudentPortfolio,
  StudentPortfolioCompetencySummary,
  StudentPortfolioEligibleAssessmentSource,
  StudentPortfolioEvidence,
  StudentPortfolioEvidenceCreateInput,
  StudentPortfolioEvidenceUpdateInput,
  StudentPortfolioOverview,
  StudentPortfolioProfessionalLink,
  StudentPortfolioProfessionalLinkInput,
  StudentPortfolioProfile,
  StudentPortfolioProfileInput,
  StudentPortfolioSoftSkillCode,
  StudentPortfolioSoftSkillSummary,
  StudentPortfolioVerificationEvent,
} from "@dse-pms/shared-types";
import { api, API_URL } from "./api";

export const studentPortfolioApi = {
  profile: () => api.get<StudentPortfolioProfile>("/api/student-portal/portfolio"),
  updateProfile: (input: StudentPortfolioProfileInput) =>
    api.put<StudentPortfolioProfile>("/api/student-portal/portfolio", input),
  overview: () => api.get<StudentPortfolioOverview>("/api/student-portal/portfolio/overview"),
  evidence: () => api.get<StudentPortfolioEvidence[]>("/api/student-portal/portfolio/evidence"),
  eligibleEvidenceSources: () => api.get<StudentPortfolioEligibleAssessmentSource[]>("/api/student-portal/portfolio/evidence/eligible-sources"),
  createEvidence: (input: StudentPortfolioEvidenceCreateInput) =>
    api.post<StudentPortfolioEvidence>("/api/student-portal/portfolio/evidence", input),
  updateEvidence: (evidenceId: string, input: StudentPortfolioEvidenceUpdateInput) =>
    api.put<StudentPortfolioEvidence>(`/api/student-portal/portfolio/evidence/${evidenceId}`, input),
  deleteEvidence: (evidenceId: string) => api.delete<void>(`/api/student-portal/portfolio/evidence/${evidenceId}`),
  links: () => api.get<StudentPortfolioProfessionalLink[]>("/api/student-portal/portfolio/links"),
  createLink: (input: StudentPortfolioProfessionalLinkInput) =>
    api.post<StudentPortfolioProfessionalLink>("/api/student-portal/portfolio/links", input),
  updateLink: (linkId: string, input: StudentPortfolioProfessionalLinkInput) =>
    api.put<StudentPortfolioProfessionalLink>(`/api/student-portal/portfolio/links/${linkId}`, input),
  deleteLink: (linkId: string) => api.delete<void>(`/api/student-portal/portfolio/links/${linkId}`),
  softSkills: () => api.get<StudentPortfolioSoftSkillSummary[]>("/api/student-portal/portfolio/soft-skills"),
  evidenceSoftSkills: (evidenceId: string) => api.get<{ skillCodes: StudentPortfolioSoftSkillCode[] }>(`/api/student-portal/portfolio/evidence/${evidenceId}/soft-skills`),
  updateEvidenceSoftSkills: (evidenceId: string, skillCodes: StudentPortfolioSoftSkillCode[]) =>
    api.put<{ skillCodes: StudentPortfolioSoftSkillCode[] }>(`/api/student-portal/portfolio/evidence/${evidenceId}/soft-skills`, { skillCodes }),
  competencies: () => api.get<StudentPortfolioCompetencySummary[]>("/api/student-portal/portfolio/competencies"),
  verificationHistory: (evidenceId: string) =>
    api.get<StudentPortfolioVerificationEvent[]>(`/api/student-portal/portfolio/evidence/${evidenceId}/verification`),
};

export async function publicStudentPortfolio(slug: string): Promise<PublicStudentPortfolio> {
  const response = await fetch(`${API_URL}/api/student-portal/portfolio/public/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 404 ? "Portfolio not found" : "Could not load public portfolio");
  return response.json() as Promise<PublicStudentPortfolio>;
}

export function normalizeCareerInterests(value: string): string[] {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}
