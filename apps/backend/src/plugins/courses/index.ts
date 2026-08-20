import { Router } from "express";
import { coursesManifest } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import { attachLatestCourseSpecReviewStatus } from "./course-list-review-status.ts";
import { createCourseRouter } from "./router.ts";
import { createCourseSectionPresenceRouter } from "./section-presence-router.ts";
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
  ReferenceError,
  type CourseService,
} from "./service.ts";
import {
  hasSpecificationDate,
  isSpecificationDateReady,
  SPECIFICATION_DATE_REQUIRED_ERROR,
} from "./specification-date-readiness.ts";

// Extend the existing Offering-based access boundary instead of creating a
// second Course Spec authorization path. Teaching & Learning already consumes
// lecturerCanAccess through the Courses registry, so it inherits this rule too.
const offeringScopedList = courseService.list.bind(courseService);
const offeringScopedSpecProgress = courseService.listSpecProgress.bind(courseService);
const offeringScopedAccess = courseService.lecturerCanAccess.bind(courseService);
const canonicalSaveSection = courseService.saveSection.bind(courseService);
const canonicalSubmitSpec = courseService.submitSpec.bind(courseService);

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

courseService.saveSection = async (courseId, sectionId, values) => {
  const result = await canonicalSaveSection(courseId, sectionId, values);
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

courseService.submitSpec = async (courseId, submittedById, note) => {
  const currentSpec = await prisma.courseSpec.findFirst({
    where: { courseId },
    orderBy: CURRENT_SPEC_ORDER,
    select: {
      specDate: true,
      sections: {
        where: { sectionKey: "date" },
        select: { status: true },
      },
    },
  });

  if (
    currentSpec &&
    !isSpecificationDateReady(
      currentSpec.sections[0]?.status === "Complete" ? "complete" : "draft",
      currentSpec.specDate?.toISOString().slice(0, 10) ?? null,
    )
  ) {
    throw new ReferenceError(SPECIFICATION_DATE_REQUIRED_ERROR);
  }

  try {
    return await canonicalSubmitSpec(courseId, submittedById, note);
  } catch (error) {
    // The Review & Submit contract intentionally defines six required items.
    // Preserve all canonical submit validation, but do not keep the older
    // backend-only Student Responsibility gate that was never represented in
    // the readiness UI. Only bypass when it is the sole remaining legacy gap.
    if (
      !(error instanceof ReferenceError) ||
      error.message !==
        "Complete all required sections before submitting: Student Responsibility"
    ) {
      throw error;
    }

    const spec = await prisma.courseSpec.findFirst({
      where: { courseId },
      orderBy: CURRENT_SPEC_ORDER,
      select: { id: true, reviewStatus: true, submissionVersion: true },
    });
    if (!spec) throw error;
    if (!["Draft", "ChangesRequested"].includes(spec.reviewStatus)) {
      throw new ReferenceError(
        "This course specification is not ready for submission",
      );
    }

    const nextVersion = spec.submissionVersion + 1;
    const nextStatus =
      spec.reviewStatus === "ChangesRequested"
        ? ("Resubmitted" as const)
        : ("Submitted" as const);

    await prisma.courseSpec.update({
      where: { id: spec.id },
      data: {
        reviewStatus: nextStatus,
        submissionVersion: nextVersion,
        submittedAt: new Date(),
        submittedById,
        submissionNote: note.trim(),
        reviewActions: {
          create: {
            submissionVersion: nextVersion,
            action:
              nextStatus === "Resubmitted" ? "Resubmitted" : "Submitted",
            actorId: submittedById,
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
  }
};

const router = Router();
// Static Responsible-Lecturer metadata routes must precede the core `/:id` routes.
router.use(createCourseSectionPresenceRouter());
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
