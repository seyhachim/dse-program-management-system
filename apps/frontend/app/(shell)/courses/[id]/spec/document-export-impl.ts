import type { CourseDocumentModel } from "./course-document-model";
import { presentCourseDocumentResources } from "./course-document-resources";
import { exportCourseSpecWord as exportCourseSpecWordRenderer } from "./document-word-renderer";

export async function exportCourseSpecWord(document: CourseDocumentModel) {
  const presentationDocument: CourseDocumentModel = {
    ...document,
    resources: presentCourseDocumentResources(document.resources),
  };
  return exportCourseSpecWordRenderer(presentationDocument);
}
