import type {
  CourseSpecView,
  MethodsResponse,
  ProgrammeAcademicConfig,
  Rubric,
  TeachingLearningProfile,
} from "@dse-pms/shared-types";
import { api } from "./api";
import { coursesApi, type CourseView } from "./courses";
import { methodsApi } from "./methods";
import { rubricsApi } from "./rubrics";
import {
  EMPTY_TEACHING_LEARNING_PROFILE,
  teachingLearningApi,
} from "./teaching-learning";

export type CourseSpecAuthoringData = {
  spec: CourseSpecView;
  methods: MethodsResponse;
  course: CourseView;
  programme: ProgrammeAcademicConfig;
  rubrics: Rubric[];
  teachingLearningProfile: TeachingLearningProfile;
};

/**
 * Load the non-Core CourseSpec dependencies as one cacheable authoring bundle.
 * The caller supplies the core CourseSpec value so the gateway and editor can
 * share the exact same protected query rather than issuing a second spec GET.
 */
export async function loadCourseSpecAuthoringData(
  courseId: string,
  spec: CourseSpecView,
): Promise<CourseSpecAuthoringData> {
  const [methods, course, programme, rubrics, teachingLearningProfile] =
    await Promise.all([
      methodsApi.list(),
      coursesApi.get(courseId),
      api.get<ProgrammeAcademicConfig>("/api/programme"),
      rubricsApi.list().catch(() => [] as Rubric[]),
      teachingLearningApi
        .get(courseId)
        .catch(() => EMPTY_TEACHING_LEARNING_PROFILE),
    ]);

  return {
    spec,
    methods,
    course,
    programme,
    rubrics,
    teachingLearningProfile,
  };
}
