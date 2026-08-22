import type {
  AddGraduationProjectPhaseInput,
  AssignGraduationProjectAdvisorInput,
  CreateGraduationProjectInput,
  CreateGraduationProjectMeetingInput,
  CreateGraduationProjectMilestoneInput,
  GraduationProjectAdvisorWorkload,
  GraduationProjectDetail,
  GraduationProjectSummary,
  ReviewGraduationProjectSubmissionInput,
  SubmitGraduationProjectMilestoneInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

const root = "/api/graduation-projects";
export const graduationProjectsApi = {
  list: (programmeId: string) => api.get<GraduationProjectSummary[]>(`${root}/projects?programmeId=${encodeURIComponent(programmeId)}`),
  mine: (programmeId = "dse") => api.get<GraduationProjectSummary[]>(`${root}/mine?programmeId=${encodeURIComponent(programmeId)}`),
  get: (id: string) => api.get<GraduationProjectDetail>(`${root}/projects/${id}`),
  create: (input: CreateGraduationProjectInput) => api.post<GraduationProjectDetail>(`${root}/projects`, input),
  advisors: (programmeId: string) => api.get<GraduationProjectAdvisorWorkload[]>(`${root}/advisors?programmeId=${encodeURIComponent(programmeId)}`),
  assignAdvisor: (id: string, input: AssignGraduationProjectAdvisorInput) => api.post<GraduationProjectDetail>(`${root}/projects/${id}/advisors`, input),
  endAdvisor: (id: string, assignmentId: string, reason: string) => api.post<GraduationProjectDetail>(`${root}/projects/${id}/advisors/${assignmentId}/end`, { reason }),
  addPhase: (id: string, input: AddGraduationProjectPhaseInput) => api.post<GraduationProjectDetail>(`${root}/projects/${id}/phases`, input),
  addMilestone: (id: string, input: CreateGraduationProjectMilestoneInput) => api.post<GraduationProjectDetail>(`${root}/projects/${id}/milestones`, input),
  submit: (milestoneId: string, input: SubmitGraduationProjectMilestoneInput) => api.post<GraduationProjectDetail>(`${root}/milestones/${milestoneId}/submissions`, input),
  review: (submissionId: string, input: ReviewGraduationProjectSubmissionInput) => api.post<GraduationProjectDetail>(`${root}/submissions/${submissionId}/reviews`, input),
  addMeeting: (id: string, input: CreateGraduationProjectMeetingInput) => api.post<GraduationProjectDetail>(`${root}/projects/${id}/meetings`, input),
};
