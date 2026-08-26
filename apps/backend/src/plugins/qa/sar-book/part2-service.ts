import type { Prisma } from "@prisma/client";
import {
  QaSarBookPart2ViewSchema,
  QaSarDocumentSchema,
  type QaSarBookPart2Requirement,
  type QaSarBookPart2Rollup,
  type QaSarBookPart2Source,
  type QaSarBookPart2View,
  type QaSarBookPart2WorkflowStatus,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { QaSarResourceNotFoundError, QaSarScopeMismatchError } from "../sar/service.ts";

type SectionStatus =
  | "NotStarted"
  | "Drafting"
  | "ReadyForReview"
  | "UnderReview"
  | "ChangesRequested"
  | "Approved";

type SectionRow = {
  id: string;
  requirementId: string;
  content: Prisma.JsonValue;
  plainText: string;
  status: SectionStatus;
  updatedAt: Date;
};

type SubmissionRow = {
  id: string;
  requirementId: string;
  sectionId: string;
  version: number;
  content: Prisma.JsonValue;
  plainText: string;
  evidenceIds: string[];
  submittedAt: Date;
  reviews: Array<{ decision: "Approved" | "ChangesRequested" | "MoreEvidenceRequested" }>;
};

type AssignmentRow = {
  id: string;
  requirementId: string;
  assigneeId: string;
  assigneeName: string;
  assigneeEmail: string;
};

export function qaSarBookPart2WorkflowStatus(
  status: SectionStatus | null,
): QaSarBookPart2WorkflowStatus {
  if (!status || status === "NotStarted") return "notStarted";
  if (status === "Drafting" || status === "ReadyForReview") return "draft";
  if (status === "UnderReview") return "submitted";
  if (status === "ChangesRequested") return "changesRequested";
  return "approved";
}

function evidenceIdsFromContent(content: Prisma.JsonValue): string[] {
  const parsed = QaSarDocumentSchema.parse(content);
  return [
    ...new Set(
      parsed.blocks
        .filter((block) => block.type === "evidenceReference")
        .map((block) => block.evidenceId),
    ),
  ];
}

function sectionSource(row: SectionRow): QaSarBookPart2Source {
  return {
    kind: "current",
    sectionId: row.id,
    submissionId: null,
    submissionVersion: null,
    content: QaSarDocumentSchema.parse(row.content),
    plainText: row.plainText,
    evidenceIds: evidenceIdsFromContent(row.content),
    capturedAt: row.updatedAt.toISOString(),
  };
}

function submissionSource(
  row: SubmissionRow,
  kind: "submission" | "approvedSubmission",
): QaSarBookPart2Source {
  return {
    kind,
    sectionId: row.sectionId,
    submissionId: row.id,
    submissionVersion: row.version,
    content: QaSarDocumentSchema.parse(row.content),
    plainText: row.plainText,
    evidenceIds: row.evidenceIds,
    capturedAt: row.submittedAt.toISOString(),
  };
}

export function summarizeQaSarBookPart2(
  requirements: QaSarBookPart2Requirement[],
): QaSarBookPart2Rollup {
  const rollup: QaSarBookPart2Rollup = {
    total: requirements.length,
    notStarted: 0,
    draft: 0,
    submitted: 0,
    changesRequested: 0,
    approved: 0,
    unassigned: 0,
    brokenEvidenceReferences: 0,
  };
  for (const requirement of requirements) {
    rollup[requirement.workflowStatus] += 1;
    if (!requirement.assignment) rollup.unassigned += 1;
    rollup.brokenEvidenceReferences += requirement.brokenEvidenceReferenceIds.length;
  }
  return rollup;
}

export async function getQaSarBookPart2(
  programmeId: string,
  cycleId: string,
): Promise<QaSarBookPart2View> {
  const cycle = await prisma.qaAssessmentCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      programmeId: true,
      framework: {
        select: {
          criteria: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              code: true,
              title: true,
              order: true,
              requirements: {
                orderBy: { order: "asc" },
                select: { id: true, code: true, title: true, order: true },
              },
            },
          },
        },
      },
    },
  });
  if (!cycle) throw new QaSarResourceNotFoundError("QA assessment cycle not found");
  if (cycle.programmeId !== programmeId) {
    throw new QaSarScopeMismatchError("SAR Part 2 belongs to a different programme");
  }

  const requirementIds = cycle.framework.criteria.flatMap((criterion) =>
    criterion.requirements.map((requirement) => requirement.id),
  );

  const [sections, submissions, assignmentRows, mappings] = await Promise.all([
    prisma.qaSarSection.findMany({
      where: { programmeId, cycleId, requirementId: { in: requirementIds } },
      select: {
        id: true,
        requirementId: true,
        content: true,
        plainText: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.qaSarSubmission.findMany({
      where: { programmeId, cycleId, requirementId: { in: requirementIds } },
      orderBy: [{ requirementId: "asc" }, { version: "desc" }],
      select: {
        id: true,
        requirementId: true,
        sectionId: true,
        version: true,
        content: true,
        plainText: true,
        evidenceIds: true,
        submittedAt: true,
        reviews: { select: { decision: true } },
      },
    }),
    prisma.$queryRaw<AssignmentRow[]>`
      SELECT
        a.id,
        a."requirementId",
        u.id AS "assigneeId",
        u.name AS "assigneeName",
        u.email AS "assigneeEmail"
      FROM "QaRequirementAssignment" a
      JOIN "User" u ON u.id = a."assigneeId"
      WHERE a."programmeId" = ${programmeId}
        AND a."cycleId" = ${cycleId}
    `,
    prisma.qaEvidenceMapping.findMany({
      where: { programmeId, cycleId, requirementId: { in: requirementIds } },
      select: { requirementId: true, evidenceId: true },
    }),
  ]);

  const sectionByRequirement = new Map(
    sections.map((section) => [section.requirementId, section as SectionRow]),
  );
  const assignmentByRequirement = new Map(
    assignmentRows.map((assignment) => [assignment.requirementId, assignment]),
  );
  const latestSubmissionByRequirement = new Map<string, SubmissionRow>();
  const approvedSubmissionByRequirement = new Map<string, SubmissionRow>();
  for (const raw of submissions) {
    const submission = raw as SubmissionRow;
    if (!latestSubmissionByRequirement.has(submission.requirementId)) {
      latestSubmissionByRequirement.set(submission.requirementId, submission);
    }
    if (
      !approvedSubmissionByRequirement.has(submission.requirementId) &&
      submission.reviews.some((review) => review.decision === "Approved")
    ) {
      approvedSubmissionByRequirement.set(submission.requirementId, submission);
    }
  }

  const mappedEvidenceByRequirement = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    const set = mappedEvidenceByRequirement.get(mapping.requirementId) ?? new Set<string>();
    set.add(mapping.evidenceId);
    mappedEvidenceByRequirement.set(mapping.requirementId, set);
  }

  const criteria = cycle.framework.criteria.map((criterion) => {
    const requirements: QaSarBookPart2Requirement[] = criterion.requirements.map((requirement) => {
      const section = sectionByRequirement.get(requirement.id) ?? null;
      const latestSubmission = latestSubmissionByRequirement.get(requirement.id) ?? null;
      const approvedSubmission = approvedSubmissionByRequirement.get(requirement.id) ?? null;
      const assignment = assignmentByRequirement.get(requirement.id) ?? null;
      const currentSource = section ? sectionSource(section) : null;
      const latestSource = latestSubmission ? submissionSource(latestSubmission, "submission") : null;
      const approvedSource = approvedSubmission
        ? submissionSource(approvedSubmission, "approvedSubmission")
        : null;
      const referencedEvidence = new Set([
        ...(currentSource?.evidenceIds ?? []),
        ...(latestSource?.evidenceIds ?? []),
        ...(approvedSource?.evidenceIds ?? []),
      ]);
      const mappedEvidence = mappedEvidenceByRequirement.get(requirement.id) ?? new Set<string>();
      const brokenEvidenceReferenceIds = [...referencedEvidence]
        .filter((evidenceId) => !mappedEvidence.has(evidenceId))
        .sort();

      return {
        requirementId: requirement.id,
        requirementCode: requirement.code,
        requirementTitle: requirement.title,
        order: requirement.order,
        workflowStatus: qaSarBookPart2WorkflowStatus(section?.status ?? null),
        assignment: assignment
          ? {
              assignmentId: assignment.id,
              assignee: {
                id: assignment.assigneeId,
                name: assignment.assigneeName,
                email: assignment.assigneeEmail,
              },
            }
          : null,
        currentSource,
        latestSubmission: latestSource,
        approvedSubmission: approvedSource,
        officialPin: approvedSubmission
          ? {
              submissionId: approvedSubmission.id,
              submissionVersion: approvedSubmission.version,
            }
          : null,
        brokenEvidenceReferenceIds,
      };
    });

    return {
      criterionId: criterion.id,
      criterionCode: criterion.code,
      criterionTitle: criterion.title,
      order: criterion.order,
      rollup: summarizeQaSarBookPart2(requirements),
      requirements,
    };
  });

  const allRequirements = criteria.flatMap((criterion) => criterion.requirements);
  return QaSarBookPart2ViewSchema.parse({
    programmeId,
    cycleId,
    generatedAt: new Date().toISOString(),
    criteria,
    totals: summarizeQaSarBookPart2(allRequirements),
  });
}
