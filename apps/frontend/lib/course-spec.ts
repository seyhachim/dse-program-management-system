import type { CourseSpecView, SpecSectionId } from "@dse-pms/shared-types";
import { api } from "./api";

/** Client for the Course Specification wizard endpoints (courses plugin sub-resource). */
export const courseSpecApi = {
  get(courseId: string): Promise<CourseSpecView> {
    return api.get<CourseSpecView>(`/api/courses/${courseId}/spec`);
  },
  submit(courseId: string, note: string) {
    return api.post<CourseSpecView>(`/api/courses/${courseId}/spec/submit`, { note });
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
