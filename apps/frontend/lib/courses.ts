import type {
  Course,
  CourseSectionPresence,
  CourseSpecProgress,
  CourseSpecTeamSummary,
  CourseSpecVersionRef,
  CreateCourseInput,
  Lecturer,
  UpdateCourseInput,
} from "@dse-pms/shared-types";
import { api } from "./api";
import { optionalCourseSectionPresence } from "./course-section-presence";

/** Course as returned by the API — lecturer and current Course Spec team joined. */
export type CourseView = Course & {
  lecturer: Lecturer | null;
  reviewStatus?: string | null;
  courseTeam?: CourseSpecTeamSummary;
};

export const coursesApi = {
  list(search?: string): Promise<CourseView[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    return api.get<CourseView[]>(`/api/courses${qs}`);
  },
  specProgress(): Promise<CourseSpecProgress[]> {
    return api.get<CourseSpecProgress[]>("/api/courses/spec-progress");
  },
  sectionPresence(): Promise<CourseSectionPresence[]> {
    return optionalCourseSectionPresence(
      api.get<CourseSectionPresence[]>("/api/courses/section-presence"),
    );
  },
  get(id: string): Promise<CourseView> {
    return api.get<CourseView>(`/api/courses/${id}`);
  },
  approvedSpecVersions(id: string): Promise<CourseSpecVersionRef[]> {
    return api.get<CourseSpecVersionRef[]>(`/api/courses/${id}/approved-spec-versions`);
  },
  create(input: CreateCourseInput): Promise<Course> {
    return api.post<Course>("/api/courses", input);
  },
  update(id: string, input: UpdateCourseInput): Promise<Course> {
    return api.patch<Course>(`/api/courses/${id}`, input);
  },
  remove(id: string): Promise<void> {
    return api.delete<void>(`/api/courses/${id}`);
  },
};
