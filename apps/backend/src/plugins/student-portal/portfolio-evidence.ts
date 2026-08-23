import {
  StudentPortfolioArtifactKind as DbArtifactKind,
  StudentPortfolioEvidenceOrigin as DbEvidenceOrigin,
  StudentPortfolioEvidenceSourceType as DbSourceType,
} from "@prisma/client";
import type {
  StudentPortfolioEligibleAssessmentSource,
  StudentPortfolioEvidence,
  StudentPortfolioEvidenceCreateInput,
  StudentPortfolioEvidenceUpdateInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { PortalAccessError, PortalNotFoundError } from "./service.ts";
import {
  invalidateVerifiedEvidenceAfterMaterialEdit,
  portfolioEvidenceSnapshotHash,
} from "./portfolio-verification.ts";

const ORIGIN_TO_DB = {
  external_project: DbEvidenceOrigin.ExternalProject,
  course_assessment: DbEvidenceOrigin.CourseAssessment,
  practicum: DbEvidenceOrigin.Practicum,
  internship: DbEvidenceOrigin.Internship,
  final_project: DbEvidenceOrigin.FinalProject,
  competition: DbEvidenceOrigin.Competition,
  achievement: DbEvidenceOrigin.Achievement,
  other: DbEvidenceOrigin.Other,
} as const;

const ORIGIN_FROM_DB = {
  [DbEvidenceOrigin.ExternalProject]: "external_project",
  [DbEvidenceOrigin.CourseAssessment]: "course_assessment",
  [DbEvidenceOrigin.Practicum]: "practicum",
  [DbEvidenceOrigin.Internship]: "internship",
  [DbEvidenceOrigin.FinalProject]: "final_project",
  [DbEvidenceOrigin.Competition]: "competition",
  [DbEvidenceOrigin.Achievement]: "achievement",
  [DbEvidenceOrigin.Other]: "other",
} as const;

const LINK_TO_DB = {
  repository: DbArtifactKind.Repository,
  demo: DbArtifactKind.Demo,
  report: DbArtifactKind.Report,
  presentation: DbArtifactKind.Presentation,
  dataset: DbArtifactKind.Dataset,
  other: DbArtifactKind.Other,
} as const;

const LINK_FROM_DB = {
  [DbArtifactKind.Repository]: "repository",
  [DbArtifactKind.Demo]: "demo",
  [DbArtifactKind.Report]: "report",
  [DbArtifactKind.Presentation]: "presentation",
  [DbArtifactKind.Dataset]: "dataset",
  [DbArtifactKind.Other]: "other",
} as const;

async function portfolioStudentId(userId: string): Promise<string> {
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true, status: true, email: true },
  });
  if (!student || student.status !== "Active" || !student.email) {
    throw new PortalAccessError("No active student portal profile is linked to this account");
  }
  return student.id;
}

async function eligibleAssessmentSource(
  studentId: string,
  offeringId: string,
  assessmentItemId: string,
) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, offeringId },
    select: {
      offering: {
        select: {
          id: true,
          term: true,
          sectionCode: true,
          courseSpecId: true,
          course: { select: { code: true, title: true } },
          courseSpec: {
            select: {
              id: true,
              reviewStatus: true,
              assessmentItems: {
                where: { id: assessmentItemId, status: "Active" },
                select: { id: true, name: true, type: true },
              },
            },
          },
        },
      },
    },
  });

  const offering = enrollment?.offering;
  const spec = offering?.courseSpec;
  const assessment = spec?.assessmentItems[0];
  if (!offering || !spec || spec.reviewStatus !== "Approved" || !assessment) {
    throw new PortalAccessError("That assessment is not an eligible portfolio source for this student");
  }

  return { offering, spec, assessment };
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

async function serializeEvidence(
  studentId: string,
  row: Awaited<ReturnType<typeof evidenceRow>>,
): Promise<StudentPortfolioEvidence> {
  const enrollment = row.sourceOfferingId
    ? await prisma.enrollment.findFirst({
        where: { studentId, offeringId: row.sourceOfferingId },
        select: { id: true },
      })
    : null;

  const sourceAvailable = Boolean(
    row.sourceType === DbSourceType.CourseAssessment &&
      enrollment &&
      row.sourceOffering &&
      row.sourceAssessmentItem &&
      row.sourceCourseSpecId &&
      row.sourceOffering.courseSpecId === row.sourceCourseSpecId &&
      row.sourceAssessmentItem.courseSpec.reviewStatus === "Approved" &&
      row.sourceAssessmentItem.status === "Active",
  );

  return {
    id: row.id,
    origin: ORIGIN_FROM_DB[row.origin],
    title: row.title,
    summary: row.summary,
    role: row.role,
    contribution: row.contribution,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    skills: row.skills,
    visibility: row.isPublic ? "public" : "private",
    featured: row.isFeatured,
    links: row.links.map((link) => ({
      id: link.id,
      kind: LINK_FROM_DB[link.kind],
      label: link.label,
      url: link.url,
    })),
    source:
      row.sourceType === DbSourceType.CourseAssessment &&
      row.sourceOfferingId &&
      row.sourceCourseSpecId &&
      row.sourceAssessmentItemId
        ? {
            type: "course_assessment",
            offeringId: row.sourceOfferingId,
            courseSpecId: row.sourceCourseSpecId,
            assessmentItemId: row.sourceAssessmentItemId,
            available: sourceAvailable,
            courseCode: sourceAvailable ? row.sourceOffering!.course.code : null,
            courseTitle: sourceAvailable ? row.sourceOffering!.course.title : null,
            term: sourceAvailable ? row.sourceOffering!.term : null,
            sectionCode: sourceAvailable ? row.sourceOffering!.sectionCode : null,
            assessmentName: sourceAvailable ? row.sourceAssessmentItem!.name : null,
            assessmentType: sourceAvailable ? row.sourceAssessmentItem!.type : null,
          }
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function evidenceInclude() {
  return {
    links: { orderBy: { createdAt: "asc" as const } },
    sourceOffering: {
      select: {
        id: true,
        term: true,
        sectionCode: true,
        courseSpecId: true,
        course: { select: { code: true, title: true } },
      },
    },
    sourceAssessmentItem: {
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        courseSpec: { select: { reviewStatus: true } },
      },
    },
  };
}

async function evidenceRow(id: string, studentId?: string) {
  const row = await prisma.studentPortfolioEvidence.findFirst({
    where: { id, ...(studentId ? { studentId } : {}) },
    include: evidenceInclude(),
  });
  if (!row) throw new PortalNotFoundError("Portfolio evidence was not found");
  return row;
}

function presentationData(input: StudentPortfolioEvidenceUpdateInput) {
  return {
    title: input.title,
    summary: input.summary,
    role: input.role,
    contribution: input.contribution,
    startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
    endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
    skills: input.skills,
    isPublic: input.visibility === "public",
    isFeatured: input.featured,
  };
}

export const studentPortfolioEvidenceService = {
  async eligibleAssessmentSources(userId: string): Promise<StudentPortfolioEligibleAssessmentSource[]> {
    const studentId = await portfolioStudentId(userId);
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId },
      select: {
        offering: {
          select: {
            id: true,
            term: true,
            sectionCode: true,
            course: { select: { code: true, title: true } },
            courseSpec: {
              select: {
                id: true,
                reviewStatus: true,
                assessmentItems: {
                  where: { status: "Active" },
                  orderBy: { order: "asc" },
                  select: { id: true, name: true, type: true },
                },
              },
            },
          },
        },
      },
    });

    return enrollments.flatMap(({ offering }) => {
      const spec = offering.courseSpec;
      if (!spec || spec.reviewStatus !== "Approved") return [];
      return spec.assessmentItems.map((assessment) => ({
        type: "course_assessment" as const,
        offeringId: offering.id,
        courseSpecId: spec.id,
        assessmentItemId: assessment.id,
        courseCode: offering.course.code,
        courseTitle: offering.course.title,
        term: offering.term,
        sectionCode: offering.sectionCode,
        assessmentName: assessment.name,
        assessmentType: assessment.type,
      }));
    });
  },

  async list(userId: string): Promise<StudentPortfolioEvidence[]> {
    const studentId = await portfolioStudentId(userId);
    const rows = await prisma.studentPortfolioEvidence.findMany({
      where: { studentId },
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      include: evidenceInclude(),
    });
    return Promise.all(rows.map((row) => serializeEvidence(studentId, row)));
  },

  async create(userId: string, input: StudentPortfolioEvidenceCreateInput): Promise<StudentPortfolioEvidence> {
    const studentId = await portfolioStudentId(userId);
    let source: Awaited<ReturnType<typeof eligibleAssessmentSource>> | null = null;
    if (input.source) {
      source = await eligibleAssessmentSource(studentId, input.source.offeringId, input.source.assessmentItemId);
    }

    const created = await prisma.studentPortfolioEvidence.create({
      data: {
        studentId,
        origin: ORIGIN_TO_DB[input.origin],
        ...presentationData(input),
        sourceType: source ? DbSourceType.CourseAssessment : null,
        sourceOfferingId: source?.offering.id ?? null,
        sourceCourseSpecId: source?.spec.id ?? null,
        sourceAssessmentItemId: source?.assessment.id ?? null,
        sourceLinkedAt: source ? new Date() : null,
        links: {
          create: input.links.map((link) => ({
            kind: LINK_TO_DB[link.kind],
            label: link.label,
            url: link.url,
          })),
        },
      },
      include: evidenceInclude(),
    });
    return serializeEvidence(studentId, created);
  },

  async update(
    userId: string,
    evidenceId: string,
    input: StudentPortfolioEvidenceUpdateInput,
  ): Promise<StudentPortfolioEvidence> {
    const studentId = await portfolioStudentId(userId);
    await evidenceRow(evidenceId, studentId);
    const beforeHash = await portfolioEvidenceSnapshotHash(evidenceId);

    await prisma.$transaction(async (tx) => {
      await tx.studentPortfolioEvidence.update({
        where: { id: evidenceId },
        data: presentationData(input),
      });
      await tx.studentPortfolioEvidenceLink.deleteMany({ where: { evidenceId } });
      if (input.links.length) {
        await tx.studentPortfolioEvidenceLink.createMany({
          data: input.links.map((link) => ({
            evidenceId,
            kind: LINK_TO_DB[link.kind],
            label: link.label,
            url: link.url,
          })),
        });
      }
    });

    await invalidateVerifiedEvidenceAfterMaterialEdit(evidenceId, beforeHash);
    return serializeEvidence(studentId, await evidenceRow(evidenceId, studentId));
  },

  async remove(userId: string, evidenceId: string): Promise<void> {
    const studentId = await portfolioStudentId(userId);
    const deleted = await prisma.studentPortfolioEvidence.deleteMany({
      where: { id: evidenceId, studentId },
    });
    if (deleted.count === 0) throw new PortalNotFoundError("Portfolio evidence was not found");
  },
};

export type StudentPortfolioEvidenceService = typeof studentPortfolioEvidenceService;
