import { Router } from "express";
import { coursesManifest } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { attachLatestCourseSpecReviewStatus } from "./course-list-review-status.ts";
import { protectCourseInfoWrite } from "./course-info-write-boundary.ts";
import { enrichCourseSpecProgress } from "./course-spec-progress-readiness.ts";
import { createCourseRouter } from "./router.ts";
import { createCourseSectionPresenceRouter } from "./section-presence-router.ts";
import { createCourseSpecPeriodicReviewRouter } from "./periodic-review-router.ts";
import { createResponsibleLecturersRouter } from "./responsible-lecturers-router.ts";
import {
  courseIdsForResponsibleLecturer,
  courseSpecTeamForVersion,
  mergeResponsibleCourses,
  responsibleLecturerCanAccess,
} from "./responsible-lecturers.ts";
import { createCourseSpecVersionHistoryRouter } from "./version-history-router.ts";
import { createCourseSpecDocumentThemeRouter } from "./document-theme-router.ts";
import { ensureCourseSpecThemeSnapshot } from "./document-theme-service.ts";
import {
  courseService,
  listSpecProgressForCourseIds,
  ReferenceError,
  type CourseService,
} from "./service.ts";
import { hasSpecificationDate } from "./specification-date-readiness.ts";

// Extend the existing Offering-based access boundary instead of creating a
// second Course Spec authorization path. Teaching & Learning already consumes
// lecturerCanAccess through the Courses registry, so it inherits this rule too.
const offeringScopedList = courseService.list.bind(courseService);
const offeringScopedSpecProgress = courseService.listSpecProgress.bind(courseService);
const offeringScopedAccess = courseService.lecturerCanAccess.bind(courseService);
const canonicalGetCourseSpecVersion = courseService.getCourseSpecVersion.bind(courseService);
const canonicalListApprovedSpecVersions = courseService.listApprovedSpecVersions.bind(courseService);
const canonicalSaveSection = courseService.saveSection.bind(courseService);

const CURRENT_SPEC_ORDER = [
  { versionMajor: "desc" as const },
  { versionMinor: "desc" as const },
];

courseService.list = async (query, lecturerScope) => {
  const rows = await offeringScopedList(query, lecturerScope);
  const scopedRows = lecturerScope
    ? await mergeResponsibleCourses(
        rows,
        lecturerScope,
        query,
        (courseId) => courseService.getDetailed(courseId),
      )
    : rows;

  return attachLatestCourseSpecReviewStatus(scopedRows);
};

courseService.listSpecProgress = async (lecturerScope) => {
  const rows = await offeringScopedSpecProgress(lecturerScope);
  let scopedRows = rows;

  if (lecturerScope) {
    const existingCourseIds = new Set(rows.map((row) => row.courseId));
    const missingResponsibleCourseIds = (
      await courseIdsForResponsibleLecturer(lecturerScope)
    ).filter((courseId) => !existingCourseIds.has(courseId));

    if (missingResponsibleCourseIds.length > 0) {
      const responsibleOnlyRows = await listSpecProgressForCourseIds(
        missingResponsibleCourseIds,
      );
      scopedRows = [...rows, ...responsibleOnlyRows].sort((a, b) =>
        a.code.localeCompare(b.code),
      );
    }
  }

  return enrichCourseSpecProgress(scopedRows);
};

courseService.lecturerCanAccess = async (courseId, lecturerId) =>
  (await offeringScopedAccess(courseId, lecturerId)) ||
  (await responsibleLecturerCanAccess(courseId, lecturerId));

// Enrich exact CourseSpec version references with that same version's academic
// Course Team. The resolver intentionally avoids Course.lecturerId so an Offering
// selecting an older Approved version never inherits a lead from a newer Draft.
courseService.getCourseSpecVersion = async (id) => {
  const spec = await canonicalGetCourseSpecVersion(id);
  if (!spec) return null;
  const courseTeam = await courseSpecTeamForVersion(spec.id);
  return courseTeam ? { ...spec, courseTeam } : spec;
};

courseService.listApprovedSpecVersions = async (courseId) => {
  const specs = await canonicalListApprovedSpecVersions(courseId);
  return Promise.all(
    specs.map(async (spec) => {
      const courseTeam = await courseSpecTeamForVersion(spec.id);
      return courseTeam ? { ...spec, courseTeam } : spec;
    }),
  );
};

courseService.saveSection = async (courseId, sectionId, values) => {
  if (sectionId === "courseInfo") {
    const currentCourse = await prisma.course.findUnique({
      where: { id: courseId },
      select: { prerequisites: true },
    });
    if (!currentCourse) throw new ReferenceError("Course not found");

    const protectedWrite = protectCourseInfoWrite(
      values,
      currentCourse.prerequisites,
    );
    if (protectedWrite.attemptedPrerequisiteWrite) {
      throw new ReferenceError(
        "Course prerequisites are read-only in Course Specification",
      );
    }
    values = protectedWrite.values;
  }

  const result = await canonicalSaveSection(courseId, sectionId, values);
  // The first successful Course Spec save creates the academic version. Snapshot
  // the programme style immediately so later default changes cannot restyle it.
  await ensureCourseSpecThemeSnapshot(courseId);
  if (sectionId !== "date") return result;

  const dateValue = (values as { date?: unknown } | null)?.date;
  if (hasSpecificationDate(dateValue)) return result;

  const currentSpec = await prisma.courseSpec.findFirst({
    where: { courseId },
    orderBy: CURRENT_SPEC_ORDER,
    select: { id: true },
  });
  if (!currentSpec) return result;

  await prisma.courseSpecSection.updateMany({
    where: { courseSpecId: currentSpec.id, sectionKey: "date" },
    data: { status: "Draft" },
  });

  return (await courseService.getSpec(courseId)) ?? result;
};



// Approval has its own timestamp and must never rewrite the submitted document's
// Specification Date. Keep both mutations in one authoritative database write.
courseService.approveSpec = async (courseId, reviewerId, note) => {
  const spec = await prisma.courseSpec.findFirst({
    where: { courseId },
    orderBy: CURRENT_SPEC_ORDER,
    select: { id: true, reviewStatus: true, submissionVersion: true },
  });
  if (!spec) {
    throw new ReferenceError("Course specification has not been started");
  }
  if (!["Submitted", "Resubmitted", "UnderReview"].includes(spec.reviewStatus)) {
    throw new ReferenceError(
      "This course specification is not awaiting review",
    );
  }

  await prisma.courseSpec.update({
    where: { id: spec.id },
    data: {
      reviewStatus: "Approved",
      approvedAt: new Date(),
      reviewActions: {
        create: {
          submissionVersion: spec.submissionVersion,
          action: "Approved",
          actorId: reviewerId,
          note: note.trim(),
        },
      },
    },
  });

  const updated = await courseService.getSpec(courseId);
  if (!updated) {
    throw new ReferenceError("Course specification has not been started");
  }
  return updated;
};

const router = Router();
// Static Responsible-Lecturer metadata routes must precede the core `/:id` routes.
router.use(createCourseSectionPresenceRouter());
// Document theme routes must precede the core `/:id/spec/:sectionId` save route.
router.use(createCourseSpecDocumentThemeRouter());
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
