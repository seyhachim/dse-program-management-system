import type {
  CourseSpecDocumentTheme,
  CourseSpecDocumentThemeResponse,
} from "@dse-pms/shared-types";
import { api } from "./api";

function withCourseSpecId(path: string, courseSpecId?: string): string {
  if (!courseSpecId) return path;
  return `${path}?courseSpecId=${encodeURIComponent(courseSpecId)}`;
}

export const courseSpecDocumentThemeApi = {
  get(courseId: string, courseSpecId?: string): Promise<CourseSpecDocumentThemeResponse> {
    return api.get<CourseSpecDocumentThemeResponse>(
      withCourseSpecId(`/api/courses/${courseId}/spec/document-theme`, courseSpecId),
    );
  },

  updateVersion(
    courseId: string,
    theme: CourseSpecDocumentTheme,
    courseSpecId?: string,
  ): Promise<CourseSpecDocumentTheme> {
    return api.put<CourseSpecDocumentTheme>(
      withCourseSpecId(`/api/courses/${courseId}/spec/document-theme`, courseSpecId),
      theme,
    );
  },

  updateProgrammeDefault(
    courseId: string,
    theme: CourseSpecDocumentTheme,
  ): Promise<CourseSpecDocumentTheme> {
    return api.put<CourseSpecDocumentTheme>(
      `/api/courses/${courseId}/spec/document-theme/programme-default`,
      theme,
    );
  },
};
