import { api } from "./api";
import type { TeachingLearningProfile } from "@dse-pms/shared-types";

export type { TeachingLearningProfile } from "@dse-pms/shared-types";

export type WeekProjectProgress = {
  weekId: string;
  milestone: string;
  expectedProgress: string;
  deliverable: string;
  status: "planned" | "in_progress" | "completed";
};

export const EMPTY_TEACHING_LEARNING_PROFILE: TeachingLearningProfile = {
  philosophyTags: [],
  philosophyStatement: "",
  teachingMethodIds: [],
  activeLearningStrategyIds: [],
  independentLearningTypes: [],
  resourceTypes: [],
  technologyTypes: [],
};

const profileCache = new Map<string, TeachingLearningProfile>();
const profileRequests = new Map<string, Promise<TeachingLearningProfile>>();

function getTeachingLearningProfile(courseId: string): Promise<TeachingLearningProfile> {
  const cached = profileCache.get(courseId);
  if (cached) return Promise.resolve(cached);

  const pending = profileRequests.get(courseId);
  if (pending) return pending;

  const request = api
    .get<TeachingLearningProfile>(`/api/teaching-learning/${courseId}`)
    .then((profile) => {
      profileCache.set(courseId, profile);
      return profile;
    })
    .finally(() => {
      profileRequests.delete(courseId);
    });

  profileRequests.set(courseId, request);
  return request;
}

export const teachingLearningApi = {
  get: getTeachingLearningProfile,
  save: (courseId: string, value: TeachingLearningProfile) =>
    api
      .put<TeachingLearningProfile>(`/api/teaching-learning/${courseId}`, value)
      .then((profile) => {
        profileCache.set(courseId, profile);
        return profile;
      }),
  invalidate: (courseId: string) => {
    profileCache.delete(courseId);
    profileRequests.delete(courseId);
  },
  getWeekProjectProgress: (courseId: string, weekId: string) =>
    api.get<WeekProjectProgress>(
      `/api/teaching-learning/${courseId}/project-progress/${weekId}`,
    ),
  saveWeekProjectProgress: (
    courseId: string,
    weekId: string,
    value: Omit<WeekProjectProgress, "weekId">,
  ) =>
    api.put<WeekProjectProgress>(
      `/api/teaching-learning/${courseId}/project-progress/${weekId}`,
      value,
    ),
};
