import { createHash } from "node:crypto";
import { Prisma, type QaCloAttainmentSnapshot } from "@prisma/client";
import { prisma } from "../../../core/db/prisma.ts";

export const CLO_ATTAINMENT_CALCULATION_VERSION = "clo-attainment-v1";
export const DEFAULT_CLO_ATTAINMENT_THRESHOLD = 50;

export type GenerateCloAttainmentInput = {
  programmeId: string;
  offeringId: string;
  thresholdPercentage?: number;
  calculationVersion?: string;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const uniqueSorted = (values: string[]) => [...new Set(values)].sort();
const hashJson = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function generateCloAttainmentSnapshots(
  input: GenerateCloAttainmentInput,
): Promise<QaCloAttainmentSnapshot[]> {
  const thresholdPercentage = input.thresholdPercentage ?? DEFAULT_CLO_ATTAINMENT_THRESHOLD;
  const calculationVersion = input.calculationVersion ?? CLO_ATTAINMENT_CALCULATION_VERSION;
  if (!Number.isFinite(thresholdPercentage) || thresholdPercentage < 0 || thresholdPercentage > 100) {
    throw new Error("CLO attainment threshold must be between 0 and 100");
  }
  if (!calculationVersion.trim()) throw new Error("CLO attainment calculation version is required");

  const offering = await prisma.offering.findFirst({
    where: { id: input.offeringId, course: { programmeId: input.programmeId } },
    select: {
      id: true,
      courseId: true,
      courseSpecId: true,
      term: true,
      startDate: true,
      endDate: true,
      enrollments: {
        select: {
          id: true,
          studentId: true,
          results: {
            where: { publishedAt: { not: null }, finalizedAt: { not: null } },
            select: {
              id: true,
              courseSpecId: true,
              assessmentItemId: true,
              score: true,
              maxScore: true,
              publishedAt: true,
              finalizedAt: true,
              updatedAt: true,
              criterionScores: {
                select: {
                  id: true, rubricId: true, criterionId: true, criterionName: true,
                  rubricContentHash: true, score: true, maxScore: true, updatedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!offering) throw new Error("Offering not found in programme");
  if (!offering.courseSpecId) throw new Error("Offering must be bound to an exact CourseSpec version");

  const [clos, assessments] = await Promise.all([
    prisma.courseSpecClo.findMany({
      where: { courseSpecId: offering.courseSpecId, status: "Active" },
      select: { id: true, order: true },
      orderBy: { order: "asc" },
    }),
    prisma.courseSpecAssessmentItem.findMany({
      where: { courseSpecId: offering.courseSpecId, status: "Active" },
      select: {
        id: true,
        cloCodes: true,
        criterionCloMappings: {
          select: { rubricId: true, criterionId: true, criterionName: true, rubricContentHash: true, cloCode: true },
        },
      },
      orderBy: { order: "asc" },
    }),
  ]);

  const snapshots: QaCloAttainmentSnapshot[] = [];
  for (const clo of clos) {
    const cloCode = `CLO${clo.order + 1}`;
    const relevant = assessments.filter(
      (assessment) => assessment.cloCodes.includes(cloCode) || assessment.criterionCloMappings.some((m) => m.cloCode === cloCode),
    );
    if (relevant.length === 0) continue;
    const relevantById = new Map(relevant.map((assessment) => [assessment.id, assessment]));

    const students: Array<{
      studentId: string; percentage: number; achieved: boolean; sources: Array<Record<string, unknown>>;
    }> = [];
    const usedResultIds: string[] = [];
    const usedCriterionIds: string[] = [];

    for (const enrollment of offering.enrollments) {
      const percentages: number[] = [];
      const sources: Array<Record<string, unknown>> = [];
      for (const result of enrollment.results) {
        if (result.courseSpecId !== offering.courseSpecId) continue;
        const assessment = relevantById.get(result.assessmentItemId);
        if (!assessment) continue;
        const mappedCriteria = result.criterionScores.filter((score) =>
          assessment.criterionCloMappings.some(
            (mapping) => mapping.cloCode === cloCode && mapping.rubricId === score.rubricId && mapping.criterionId === score.criterionId,
          ),
        );
        if (mappedCriteria.length > 0) {
          for (const score of mappedCriteria) {
            if (score.maxScore <= 0) continue;
            const percentage = round2((score.score / score.maxScore) * 100);
            percentages.push(percentage);
            usedCriterionIds.push(score.id);
            usedResultIds.push(result.id);
            sources.push({
              source: "criterion", assessmentItemId: assessment.id, resultId: result.id, criterionScoreId: score.id,
              rubricId: score.rubricId, criterionId: score.criterionId, rubricContentHash: score.rubricContentHash,
              score: score.score, maxScore: score.maxScore, percentage,
              publishedAt: result.publishedAt?.toISOString() ?? null,
              finalizedAt: result.finalizedAt?.toISOString() ?? null,
              resultUpdatedAt: result.updatedAt.toISOString(), criterionUpdatedAt: score.updatedAt.toISOString(),
            });
          }
        } else if (assessment.cloCodes.includes(cloCode) && result.maxScore > 0) {
          const percentage = round2((result.score / result.maxScore) * 100);
          percentages.push(percentage);
          usedResultIds.push(result.id);
          sources.push({
            source: "assessment", assessmentItemId: assessment.id, resultId: result.id, score: result.score,
            maxScore: result.maxScore, percentage,
            publishedAt: result.publishedAt?.toISOString() ?? null,
            finalizedAt: result.finalizedAt?.toISOString() ?? null,
            resultUpdatedAt: result.updatedAt.toISOString(),
          });
        }
      }
      if (percentages.length > 0) {
        const percentage = round2(percentages.reduce((sum, value) => sum + value, 0) / percentages.length);
        students.push({ studentId: enrollment.studentId, percentage, achieved: percentage >= thresholdPercentage, sources });
      }
    }

    const sourceAssessmentItemIds = uniqueSorted(relevant.map((assessment) => assessment.id));
    const sourceMappingKeys = uniqueSorted(relevant.flatMap((assessment) => [
      ...(assessment.cloCodes.includes(cloCode) ? [`assessment:${offering.courseSpecId}:${assessment.id}:${cloCode}`] : []),
      ...assessment.criterionCloMappings
        .filter((mapping) => mapping.cloCode === cloCode)
        .map((mapping) => `criterion:${offering.courseSpecId}:${assessment.id}:${mapping.rubricId}:${mapping.criterionId}:${cloCode}:${mapping.rubricContentHash}`),
    ]));
    const studentCount = students.length;
    const achievedCount = students.filter((student) => student.achieved).length;
    const achievedRate = studentCount === 0 ? null : round2((achievedCount / studentCount) * 100);
    const thresholdRule = {
      kind: "studentMeanMappedEvidenceGte", thresholdPercentage, publishedAndFinalizedResultsOnly: true,
      criterionEvidencePreferred: true, emptyPopulationRate: null,
    };
    const sourceEvidence = {
      offering: { id: offering.id, term: offering.term, startDate: offering.startDate?.toISOString().slice(0, 10) ?? null, endDate: offering.endDate?.toISOString().slice(0, 10) ?? null },
      courseSpecId: offering.courseSpecId, clo: { id: clo.id, code: cloCode }, calculationVersion, thresholdRule,
      populationSize: offering.enrollments.length, students: students.sort((a, b) => a.studentId.localeCompare(b.studentId)),
      sourceAssessmentItemIds, sourceMappingKeys,
    };
    const calculationHash = hashJson(sourceEvidence);
    const existing = await prisma.qaCloAttainmentSnapshot.findFirst({
      where: { offeringId: offering.id, courseSpecId: offering.courseSpecId, cloId: clo.id, calculationVersion, calculationHash },
    });
    if (existing) { snapshots.push(existing); continue; }
    const previous = await prisma.qaCloAttainmentSnapshot.findFirst({
      where: { offeringId: offering.id, courseSpecId: offering.courseSpecId, cloId: clo.id, calculationVersion },
      orderBy: { generatedAt: "desc" },
    });
    snapshots.push(await prisma.qaCloAttainmentSnapshot.create({
      data: {
        programmeId: input.programmeId, courseId: offering.courseId, courseSpecId: offering.courseSpecId, cloId: clo.id,
        offeringId: offering.id, cloCode, periodKey: offering.term, calculationVersion, thresholdPercentage,
        thresholdRule: thresholdRule as Prisma.InputJsonValue, populationSize: offering.enrollments.length, studentCount,
        achievedCount, achievedRate, sourceAssessmentItemIds, sourceAssessmentResultIds: uniqueSorted(usedResultIds),
        sourceCriterionScoreIds: uniqueSorted(usedCriterionIds), sourceMappingKeys,
        sourceEvidence: sourceEvidence as Prisma.InputJsonValue, calculationHash, supersedesSnapshotId: previous?.id ?? null,
      },
    }));
  }
  return snapshots;
}
