import type {
  CourseSpecExactVersionView,
  CourseSpecVersionComparisonView,
  CourseSpecVersionHistoryView,
} from "@dse-pms/shared-types";
import { api } from "./api";

export const courseSpecHistoryApi = {
  list(courseId: string) {
    return api.get<CourseSpecVersionHistoryView>(`/api/courses/${courseId}/spec/versions`);
  },
  get(courseId: string, versionId: string) {
    return api.get<CourseSpecExactVersionView>(`/api/courses/${courseId}/spec/versions/${versionId}`);
  },
  compare(courseId: string, fromVersionId: string, toVersionId: string) {
    return api.get<CourseSpecVersionComparisonView>(
      `/api/courses/${courseId}/spec/versions/${fromVersionId}/compare/${toVersionId}`,
    );
  },
};

export function exactVersionHref(courseId: string, versionId: string) {
  return `/courses/${courseId}/spec/versions/${versionId}`;
}

export function comparisonHref(courseId: string, fromVersionId: string, toVersionId: string) {
  const query = new URLSearchParams({ from: fromVersionId, to: toVersionId });
  return `/courses/${courseId}/spec/compare?${query.toString()}`;
}
