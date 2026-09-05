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

// Keep the latest resolved value only for synchronous Overview reuse. Network
// freshness belongs to the shared query cache; `api.get` already deduplicates
// concurrent requests, so a second completed-promise cache would make this data
// stale indefinitely across collaborative editing sessions.
const profileValueCache = new Map<string, TeachingLearningProfile>();

export const teachingLearningApi = {
  get(courseId: string): Promise<TeachingLearningProfile> {
    return api
      .get<TeachingLearningProfile>(`/api/teaching-learning/${courseId}`)
      .then((profile) => {
        profileValueCache.set(courseId, profile);
        return profile;
      })
      .catch((error) => {
        profileValueCache.delete(courseId);
        throw error;
      });
  },
  getCached(courseId: string): TeachingLearningProfile | undefined {
    return profileValueCache.get(courseId);
  },
  async save(courseId: string, value: TeachingLearningProfile) {
    const saved = await api.put<TeachingLearningProfile>(
      `/api/teaching-learning/${courseId}`,
      value,
    );
    profileValueCache.set(courseId, saved);
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