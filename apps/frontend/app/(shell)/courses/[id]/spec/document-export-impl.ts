import type {
  CourseSpecDocumentTheme,
} from "@dse-pms/shared-types";
import type { CourseDocumentModel } from "./course-document-model";
import {
  courseAvailabilityCheckboxText,
  courseTypeCheckboxText,
} from "./course-information-checkboxes";
import { presentCourseDocumentResources } from "./course-document-resources";
import { exportCourseSpecWord as exportCourseSpecWordRenderer } from "./document-word-renderer";

export async function exportCourseSpecWord(
  document: CourseDocumentModel,
  theme: CourseSpecDocumentTheme,
) {
  const presentationDocument: CourseDocumentModel = {
    ...document,
    courseInformation: {
      ...document.courseInformation,
      courseType: courseTypeCheckboxText(document.courseInformation.courseType),
      semester: courseAvailabilityCheckboxText(document.courseInformation.semester),
    },
    resources: presentCourseDocumentResources(document.resources),
  };
  return exportCourseSpecWordRenderer(presentationDocument, theme);
}
