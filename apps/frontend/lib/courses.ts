import type {
  Course,
  CourseSpecProgress,
  CreateCourseInput,
  Lecturer,
  UpdateCourseInput,
} from "@dse-pms/shared-types";
import { api } from "./api";

/** Course as returned by the API — lecturer/coLecturers joined via the registry. */
export type CourseView = Course & { lecturer: Lecturer | null; coLecturers: Lecturer[] };

export const coursesApi = {
  list(search?: string): Promise<CourseView[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return api.get<CourseView[]>(`/api/courses${qs}`);
  },
  specProgress(): Promise<CourseSpecProgress[]> {
    return api.get<CourseSpecProgress[]>("/api/courses/spec-progress");
  },
  get(id: string): Promise<CourseView> {
    return api.get<CourseView>(`/api/courses/${id}`);
  },
  create(input: CreateCourseInput): Promise<CourseView> {
    return api.post<CourseView>("/api/courses", input);
  },
  update(id: string, input: UpdateCourseInput): Promise<CourseView> {
    return api.patch<CourseView>(`/api/courses/${id}`, input);
  },
  remove(id: string): Promise<void> {
    return api.delete<void>(`/api/courses/${id}`);
  },
};
