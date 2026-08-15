import type {
  QaContributorWorkspaceView,
  QaCycleView,
  QaEvidenceReadiness,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";
import { listMyQaRequirementAssignments } from "../assignments/service.ts";

const cycleStatus = {
  Draft: "draft",
  Active: "active",
  UnderReview: "underReview",
  Closed: "closed",
} as const;

function toCycleView(cycle: {
  id: string;
  programmeId: string;
  title: string;
  reportingStart: Date;
  reportingEnd: Date;
  status: keyof typeof cycleStatus;
  createdAt: Date;
}): QaCycleView {
  return {
    id: cycle.id,
    programmeId: cycle.programmeId,
    title: cycle.title,
    reportingStart: cycle.reportingStart.toISOString(),
    reportingEnd: cycle.reportingEnd.toISOString(),
    status: cycleStatus[cycle.status],
    createdAt: cycle.createdAt.toISOString(),
  };
}

function evidenceReadiness(count: number, reviewedCount: number): QaEvidenceReadiness {
  if (count === 0) return "none";
  if (reviewedCount === count) return "reviewed";
  return "collected";
}

export async function getQaContributorWorkspace(
  programmeId: string,
  userId: string,
): Promise<QaContributorWorkspaceView> {
  const activeCycle = await prisma.qaAssessmentCycle.findFirst({
    where: { programmeId, status: "Active" },
    orderBy: [{ reportingEnd: "desc" }, { createdAt: "desc" }],
  });
  const selectedCycle =
    activeCycle ??
    (await prisma.qaAssessmentCycle.findFirst({
      where: { programmeId },
      orderBy: [{ reportingEnd: "desc" }, { createdAt: "desc" }],
    }));

  if (!selectedCycle) {
    return { programmeId, selectedCycle: null, work: [] };
  }

  const assignments = await listMyQaRequirementAssignments(
    programmeId,
    selectedCycle.id,
    userId,
  );
  if (assignments.length === 0) {
    return {
      programmeId,
      selectedCycle: toCycleView(selectedCycle),
      work: [],
    };
  }

  const requirementCodes = assignments.map((item) => item.requirementCode);
  const evidenceMappings = await prisma.qaEvidenceMapping.findMany({
    where: {
      programmeId,
      cycleId: selectedCycle.id,
      requirement: { code: { in: requirementCodes } },
    },
    select: {
      requirement: { select: { code: true } },
      evidence: { select: { status: true } },
    },
  });

  const counts = new Map<string, { count: number; reviewedCount: number }>();
  for (const row of evidenceMappings) {
    const current = counts.get(row.requirement.code) ?? { count: 0, reviewedCount: 0 };
    current.count += 1;
    if (row.evidence.status === "Reviewed") current.reviewedCount += 1;
    counts.set(row.requirement.code, current);
  }

  return {
    programmeId,
    selectedCycle: toCycleView(selectedCycle),
    work: assignments.map((assignment) => {
      const count = counts.get(assignment.requirementCode) ?? { count: 0, reviewedCount: 0 };
      return {
        assignment,
        evidence: {
          count: count.count,
          reviewedCount: count.reviewedCount,
          readiness: evidenceReadiness(count.count, count.reviewedCount),
        },
        // SAR content/review models arrive in phases 7 and 8. Keep these
        // dimensions explicit now rather than inventing a combined percentage.
        writingStatus: "notStarted" as const,
        reviewStatus: "notSubmitted" as const,
      };
    }),
  };
}
