import type { CourseSpecView, SpecSectionId } from "@dse-pms/shared-types";
import { api } from "./api";

/** Client for the Course Specification wizard endpoints (courses plugin sub-resource). */
export const courseSpecApi = {
  get(courseId: string): Promise<CourseSpecView> {
    return api.get<CourseSpecView>(`/api/courses/${courseId}/spec`);
  },
  saveSection(
    courseId: string,
    sectionId: SpecSectionId,
    values: unknown,
  ): Promise<CourseSpecView> {
    return api.put<CourseSpecView>(
      `/api/courses/${courseId}/spec/${sectionId}`,
      values,
    );
  },
};
