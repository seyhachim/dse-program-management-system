import { Router } from "express";
import {
  CONSTRUCTIVE_ALIGNMENT_REQUIRED_ERROR,
  coursesManifest,
  isConstructiveAlignmentReady,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import type { BackendPlugin } from "../../core/plugins/registry.ts";
import {
  MISSING_RESUBMISSION_SPECIFICATION_DATE_ERROR,
  specificationDateForSubmission,
} from "./automatic-specification-date.ts";
import { attachLatestCourseSpecReviewStatus } from "./course-list-review-status.ts";
import { enrichCourseSpecProgress } from "./course-spec-progress-readiness.ts";
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

courseService.saveSection = async (courseId, sectionId, values) => {
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

courseService.submitSpec = async (courseId, submittedById, note) => {
  const currentSpec = await prisma.courseSpec.findFirst({
    where: { courseId },
    orderBy: CURRENT_SPEC_ORDER,
    select: {
      id: true,
      reviewStatus: true,
      submissionVersion: true,
      specDate: true,
      sections: {
        select: { sectionKey: true, status: true },
      },
      clos: {
        orderBy: { order: "asc" },
        select: {
          order: true,
          status: true,
          mappedPlos: true,
          teachingMethods: { select: { teachingMethodId: true } },
        },
      },
      weeks: {
        select: { cloCodes: true },
      },
      assessmentItems: {
        select: { status: true, cloCodes: true },
      },
    },
  });

  if (!currentSpec) {
    throw new ReferenceError("Course specification has not been started");
  }
  if (!["Draft", "ChangesRequested"].includes(currentSpec.reviewStatus)) {
    throw new ReferenceError(
      "This course specification is not ready for submission",
    );
  }

  const savedComplete = (sectionId: string) =>
    currentSpec.sections.some(
      (saved) =>
        saved.sectionKey === sectionId && saved.status === "Complete",
    );
  const activeClos = currentSpec.clos.filter((clo) => clo.status === "Active");
  const readinessGaps: string[] = [];

  if (!savedComplete("courseInfo")) readinessGaps.push("Course Information");
  if (
    !savedComplete("clos") ||
    activeClos.length === 0 ||
    activeClos.some((clo) => clo.mappedPlos.length === 0)
  ) {
    readinessGaps.push("Course Learning Outcomes");
  }
  if (
    activeClos.length === 0 ||
    activeClos.some((clo) => clo.teachingMethods.length === 0)
  ) {
    readinessGaps.push("Teaching & Learning");
  }
  if (!savedComplete("assessmentPlan")) readinessGaps.push("Assessment");
  if (!savedComplete("slt")) readinessGaps.push("Weekly Plan");

  // Review & Submit intentionally excludes the older backend-only Student
  // Responsibility gate. Keep the authoritative backend set aligned with the UI.
  if (readinessGaps.length > 0) {
    throw new ReferenceError(
      `Complete all required sections before submitting: ${readinessGaps.join(", ")}`,
    );
  }

  if (
    !isConstructiveAlignmentReady(
      currentSpec.clos.map((clo) => ({
        code: `CLO${clo.order + 1}`,
        status: clo.status === "Active" ? "active" : "inactive",
      })),
      currentSpec.weeks,
      currentSpec.assessmentItems.map((assessment) => ({
        status: assessment.status === "Active" ? "active" : "inactive",
        cloCodes: assessment.cloCodes,
      })),
    )
  ) {
    throw new ReferenceError(CONSTRUCTIVE_ALIGNMENT_REQUIRED_ERROR);
  }

  const submittedAt = new Date();
  let specificationDate: Date;
  try {
    specificationDate = specificationDateForSubmission({
      reviewStatus: currentSpec.reviewStatus as "Draft" | "ChangesRequested",
      existingDate: currentSpec.specDate,
      now: submittedAt,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === MISSING_RESUBMISSION_SPECIFICATION_DATE_ERROR
    ) {
      throw new ReferenceError(error.message);
    }
    throw error;
  }

  const nextVersion = currentSpec.submissionVersion + 1;
  const nextStatus =
    currentSpec.reviewStatus === "ChangesRequested"
      ? ("Resubmitted" as const)
      : ("Submitted" as const);

  await prisma.$transaction([
    prisma.courseSpecSection.upsert({
      where: {
        courseSpecId_sectionKey: {
          courseSpecId: currentSpec.id,
          sectionKey: "date",
        },
      },
      create: {
        courseSpecId: currentSpec.id,
        sectionKey: "date",
        status: "Complete",
      },
      update: { status: "Complete" },
    }),
    prisma.courseSpec.update({
      where: { id: currentSpec.id },
      data: {
        specDate: specificationDate,
        reviewStatus: nextStatus,
        submissionVersion: nextVersion,
        submittedAt,
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
    }),
  ]);

  const updated = await courseService.getSpec(courseId);
  if (!updated) {
    throw new ReferenceError("Course specification has not been started");
  }
  return updated;
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
