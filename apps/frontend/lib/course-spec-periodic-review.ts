import type {
  CourseSpecPeriodicReviewView,
  CreateCourseSpecPeriodicReviewInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const courseSpecPeriodicReviewApi = {
  create: (courseId: string, input: CreateCourseSpecPeriodicReviewInput) =>
    api.post<CourseSpecPeriodicReviewView>(
      `/api/courses/${courseId}/spec/periodic-reviews`,
      input,
    ),
};
