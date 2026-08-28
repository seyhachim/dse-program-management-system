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

const profileReadCache = new Map<string, Promise<TeachingLearningProfile>>();

export const teachingLearningApi = {
  get(courseId: string): Promise<TeachingLearningProfile> {
    const cached = profileReadCache.get(courseId);
    if (cached) return cached;

    const request = api
      .get<TeachingLearningProfile>(`/api/teaching-learning/${courseId}`)
      .catch((error) => {
        profileReadCache.delete(courseId);
        throw error;
      });
    profileReadCache.set(courseId, request);
    return request;
  },
  async save(courseId: string, value: TeachingLearningProfile) {
    const saved = await api.put<TeachingLearningProfile>(
      `/api/teaching-learning/${courseId}`,
      value,
    );
    profileReadCache.set(courseId, Promise.resolve(saved));
    return saved;
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