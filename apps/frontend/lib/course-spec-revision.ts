import type {
  CourseSpecRevisionCreationResult,
  CreateCourseSpecRevisionRequest,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const courseSpecRevisionApi = {
  create(courseId: string, input: CreateCourseSpecRevisionRequest) {
    return api.post<CourseSpecRevisionCreationResult>(
      `/api/courses/${courseId}/spec/revisions`,
      input,
    );
  },
};
