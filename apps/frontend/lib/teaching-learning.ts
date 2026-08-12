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
};
