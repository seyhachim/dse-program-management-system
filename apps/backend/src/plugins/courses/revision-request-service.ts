import type { CourseSpecRevisionTrigger } from "@prisma/client";
import {
  type CreateCourseSpecRevisionRequest,
  type CourseSpecRevisionImpact,
  recommendedCourseSpecRevisionType,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  courseSpecRevisionService,
  type RevisionKind,
} from "./revision-service.ts";
import { ensureCourseSpecThemeSnapshot } from "./document-theme-service.ts";

export class CourseSpecRevisionRequestError extends Error {
  constructor(
    message: string,
    readonly code:
      | "COURSE_NOT_FOUND"
      | "NOT_AUTHORIZED"
      | "SOURCE_NOT_APPROVED"
      | "OPEN_REVISION_EXISTS"
      | "INVALID_OVERRIDE",
  ) {
    super(message);
    this.name = "CourseSpecRevisionRequestError";
  }
}

const impactToColumns = (impact: CourseSpecRevisionImpact) => ({
  impactCourseCodeOrTitle: impact.courseCodeOrTitle,
  impactCreditsOrSlt: impact.creditsOrSlt,
  impactPrerequisites: impact.prerequisites,
  impactMaterialCloChanges: impact.materialCloChanges,
  impactBloomOrCapLevels: impact.bloomOrCapLevels,
  impactCloPloAlignment: impact.cloPloAlignment,
  impactAssessmentStructureOrWeighting: impact.assessmentStructureOrWeighting,
  impactCurriculumOrRegulatoryAlignment: impact.curriculumOrRegulatoryAlignment,
});

const columnsToImpact = (row: {
  impactCourseCodeOrTitle: boolean;
  impactCreditsOrSlt: boolean;
  impactPrerequisites: boolean;
  impactMaterialCloChanges: boolean;
  impactBloomOrCapLevels: boolean;
  impactCloPloAlignment: boolean;
  impactAssessmentStructureOrWeighting: boolean;
  impactCurriculumOrRegulatoryAlignment: boolean;
}): CourseSpecRevisionImpact => ({
  courseCodeOrTitle: row.impactCourseCodeOrTitle,
  creditsOrSlt: row.impactCreditsOrSlt,
  prerequisites: row.impactPrerequisites,
  materialCloChanges: row.impactMaterialCloChanges,
  bloomOrCapLevels: row.impactBloomOrCapLevels,
  cloPloAlignment: row.impactCloPloAlignment,
  assessmentStructureOrWeighting: row.impactAssessmentStructureOrWeighting,
  curriculumOrRegulatoryAlignment: row.impactCurriculumOrRegulatoryAlignment,
});

export const courseSpecRevisionRequestService = {
  async create(
    courseId: string,
    requestedById: string,
    input: CreateCourseSpecRevisionRequest,
  ) {
    const recommendedRevisionType = recommendedCourseSpecRevisionType(input.impact);
    if (
      recommendedRevisionType === "Major" &&
      input.proposedRevisionType === "Minor" &&
      input.overrideJustification.trim().length < 10
    ) {
      throw new CourseSpecRevisionRequestError(
        "A written justification is required to override a Major recommendation",
        "INVALID_OVERRIDE",
      );
    }

    const result = await courseSpecRevisionService.createCourseSpecRevision({
      courseId,
      revisionType: input.proposedRevisionType as RevisionKind,
      triggers: input.triggers as CourseSpecRevisionTrigger[],
      reason: input.evidenceSummary,
      changeSummary: input.changeSummary,
      initiatedById: requestedById,
      revisionRequest: {
        requestedById,
        triggers: input.triggers as CourseSpecRevisionTrigger[],
        evidenceSummary: input.evidenceSummary,
        changeSummary: input.changeSummary,
        proposedRevisionType: input.proposedRevisionType,
        recommendedRevisionType,
        overrideJustification: input.overrideJustification,
        effectiveAcademicTerm: input.effectiveAcademicTerm,
        ...impactToColumns(input.impact),
      },
    });

    // New revisions inherit the programme default at creation time. The
    // resulting version snapshot is independent from future programme edits.
    await ensureCourseSpecThemeSnapshot(courseId, result.id);

    const request = await prisma.courseSpecRevisionRequest.findUniqueOrThrow({
      where: { courseSpecId: result.id },
    });

    return {
      revision: result,
      request: {
        id: request.id,
        courseSpecId: request.courseSpecId,
        requestedById: request.requestedById,
        triggers: request.triggers,
        evidenceSummary: request.evidenceSummary,
        changeSummary: request.changeSummary,
        impact: columnsToImpact(request),
        proposedRevisionType: request.proposedRevisionType as "Minor" | "Major",
        recommendedRevisionType: request.recommendedRevisionType as "Minor" | "Major",
        overrideJustification: request.overrideJustification,
        effectiveAcademicTerm: request.effectiveAcademicTerm,
        createdAt: request.createdAt.toISOString(),
      },
    };
  },
};
