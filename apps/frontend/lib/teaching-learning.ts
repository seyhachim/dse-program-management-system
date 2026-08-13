import { api } from "./api";

export type TeachingLearningProfile = {
  philosophyTags: string[];
  philosophyStatement: string;
  teachingMethodIds: string[];
  activeLearningStrategyIds: string[];
  independentLearningTypes: string[];
  resourceTypes: string[];
  technologyTypes: string[];
};

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

export const teachingLearningApi = {
  get: (courseId: string) =>
    api.get<TeachingLearningProfile>(`/api/teaching-learning/${courseId}`),
  save: (courseId: string, value: TeachingLearningProfile) =>
    api.put<TeachingLearningProfile>(`/api/teaching-learning/${courseId}`, value),
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
