import { Router } from "express";
import { coursesManifest } from "@dse-pms/shared-types";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { createCourseRouter } from "./router.ts";
import { createCourseSpecPeriodicReviewRouter } from "./periodic-review-router.ts";
import { createResponsibleLecturersRouter } from "./responsible-lecturers-router.ts";
import {
  courseIdsForResponsibleLecturer,
  mergeResponsibleCourses,
  responsibleLecturerCanAccess,
} from "./responsible-lecturers.ts";
import { createCourseSpecVersionHistoryRouter } from "./version-history-router.ts";
import {
  courseService,
  listSpecProgressForCourseIds,
  type CourseService,
} from "./service.ts";

// Extend the existing Offering-based access boundary instead of creating a
// second Course Spec authorization path. Teaching & Learning already consumes
// lecturerCanAccess through the Courses registry, so it inherits this rule too.
const offeringScopedList = courseService.list.bind(courseService);
const offeringScopedSpecProgress = courseService.listSpecProgress.bind(courseService);
const offeringScopedAccess = courseService.lecturerCanAccess.bind(courseService);

courseService.list = async (query, lecturerScope) => {
  const rows = await offeringScopedList(query, lecturerScope);
  if (!lecturerScope) return rows;
  return mergeResponsibleCourses(
    rows,
    lecturerScope,
    query,
    (courseId) => courseService.getDetailed(courseId),
  );
};

courseService.listSpecProgress = async (lecturerScope) => {
  const rows = await offeringScopedSpecProgress(lecturerScope);
  if (!lecturerScope) return rows;

  const existingCourseIds = new Set(rows.map((row) => row.courseId));
  const missingResponsibleCourseIds = (
    await courseIdsForResponsibleLecturer(lecturerScope)
  ).filter((courseId) => !existingCourseIds.has(courseId));

  if (missingResponsibleCourseIds.length === 0) return rows;

  const responsibleOnlyRows = await listSpecProgressForCourseIds(
    missingResponsibleCourseIds,
  );

  return [...rows, ...responsibleOnlyRows].sort((a, b) =>
    a.code.localeCompare(b.code),
  );
};

courseService.lecturerCanAccess = async (courseId, lecturerId) =>
  (await offeringScopedAccess(courseId, lecturerId)) ||
  (await responsibleLecturerCanAccess(courseId, lecturerId));

const router = Router();
// Must precede the core `/:id/spec/:sectionId` route.
router.use(createResponsibleLecturersRouter());
router.use(createCourseRouter());
router.use(createCourseSpecPeriodicReviewRouter());
router.use(createCourseSpecVersionHistoryRouter());

export const coursesPlugin: BackendPlugin<CourseService> = {
  manifest: coursesManifest,
  router,
  service: courseService,
};
