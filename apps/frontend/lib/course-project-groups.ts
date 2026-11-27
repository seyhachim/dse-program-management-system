import type { CourseProjectGroupActionInput, CourseProjectGroupPolicyInput, CourseProjectGroupRegistrationView, CourseProjectGroupReviewInput } from "@dse-pms/shared-types";
import { api } from "./api";
function endpoint(offeringId: string, assessmentItemId: string, manager: boolean) {
  return `/api/student-portal/${manager ? "manage/offerings" : "courses"}/${encodeURIComponent(offeringId)}/assessments/${encodeURIComponent(assessmentItemId)}/project-groups`;
}
export const courseProjectGroupsApi = {
  get: (offeringId: string, assessmentItemId: string, manager: boolean) => api.get<CourseProjectGroupRegistrationView>(endpoint(offeringId, assessmentItemId, manager)),
  configure: (offeringId: string, assessmentItemId: string, input: CourseProjectGroupPolicyInput) => api.put<CourseProjectGroupRegistrationView>(endpoint(offeringId, assessmentItemId, true), input),
  action: (offeringId: string, assessmentItemId: string, input: CourseProjectGroupActionInput) => api.post<CourseProjectGroupRegistrationView>(endpoint(offeringId, assessmentItemId, false), input),
  review: (offeringId: string, assessmentItemId: string, input: CourseProjectGroupReviewInput) => api.post<CourseProjectGroupRegistrationView>(endpoint(offeringId, assessmentItemId, true), input),
};
