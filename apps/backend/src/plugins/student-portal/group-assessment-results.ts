import type {
  CorrectAssessmentGroupScoreInput,
  CorrectAssessmentIndividualComponentInput,
  FinalizeAssessmentResultsInput,
  FinalizeAssessmentResultsResponse,
  GroupAssessmentWorkspace,
  PublishAssessmentResultsInput,
  PublishAssessmentResultsResponse,
  SaveAssessmentGroupScoreInput,
  SaveAssessmentGroupsInput,
  SaveAssessmentIndividualComponentInput,
  SaveAssessmentSourceCriterionScoresInput,
} from "@dse-pms/shared-types";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";
import { rubricContentHash } from "../../core/academic/rubric-context.ts";
import { canManageOfferingResults } from "./result-management-access.ts";
import { PortalAccessError, PortalConflictError, PortalNotFoundError } from "./service.ts";

type Db = Prisma.TransactionClient | PrismaClient;

type DerivedInput = {
  mode: "Group" | "GroupIndividual";
  groupScore: number;
  groupMaxScore: number;
  groupFeedback?: string;
  groupWeight?: number | null;
  individualScore?: number | null;
  individualMaxScore?: number | null;
  individualFeedback?: string;
  individualWeight?: number | null;
  adjustmentPoints?: number;
  adjustmentReason?: string;
};

export function calculateDerivedGroupResult(input: DerivedInput): { score: number; maxScore: number; feedback: string } {
  if (input.groupMaxScore <= 0 || input.groupScore < 0 || input.groupScore > input.groupMaxScore) {
    throw new PortalConflictError("Group score is outside its valid range");
  }
  if (input.mode === "Group") {
    return { score: input.groupScore, maxScore: input.groupMaxScore, feedback: input.groupFeedback ?? "" };
  }
  if (input.groupWeight === null || input.groupWeight === undefined || input.individualWeight === null || input.individualWeight === undefined || Math.abs(input.groupWeight + input.individualWeight - 100) > 0.000001) {
    throw new PortalConflictError("Group + Individual weights must total 100%");
  }
  if (input.individualScore === null || input.individualScore === undefined || input.individualMaxScore === null || input.individualMaxScore === undefined || input.individualMaxScore <= 0) {
    throw new PortalConflictError("Individual component is incomplete");
  }
  const adjusted = input.individualScore + (input.adjustmentPoints ?? 0);
  if (adjusted < 0 || adjusted > input.individualMaxScore) throw new PortalConflictError("Adjusted individual score is outside its valid range");
  const percentage = (input.groupScore / input.groupMaxScore) * input.groupWeight + (adjusted / input.individualMaxScore) * input.individualWeight;
  const feedback = [
    input.groupFeedback ? `Group: ${input.groupFeedback}` : "",
    input.individualFeedback ? `Individual: ${input.individualFeedback}` : "",
    (input.adjustmentPoints ?? 0) !== 0 ? `Adjustment ${(input.adjustmentPoints ?? 0) > 0 ? "+" : ""}${input.adjustmentPoints}: ${input.adjustmentReason ?? ""}` : "",
  ].filter(Boolean).join("\n");
  return { score: Math.round(percentage * 10000) / 10000, maxScore: 100, feedback };
}

export function assertRubricLevelScoreMatches(
  score: number,
  selectedLevelPoints: number,
) {
  if (Math.abs(selectedLevelPoints - score) > 1e-9) {
    throw new PortalConflictError("Selected rubric level points do not match the criterion score");
  }
}

async function contextFor(db: Db, offeringId: string, assessmentItemId: string, actorId: string, programmeWide: boolean) {
  const offering = await db.offering.findUnique({
    where: { id: offeringId },
    include: {
      coLecturers: true,
      enrollments: { include: { student: { select: { id: true, studentId: true, name: true } } }, orderBy: { student: { name: "asc" } } },
      courseSpec: {
        include: {
          assessmentItems: {
            include: {
              criterionCloMappings: true,
              rubric: { include: { levelRows: { orderBy: { order: "asc" } }, criterionRows: { orderBy: { order: "asc" } } } },
            },
          },
        },
      },
    },
  });
  if (!offering) throw new PortalNotFoundError("Offering not found");
  if (!canManageOfferingResults(actorId, programmeWide, offering.lecturerId, offering.coLecturers.map((item) => item.lecturerId))) {
    throw new PortalAccessError("You are not assigned to this offering");
  }
  const spec = offering.courseSpec;
  if (!spec) throw new PortalConflictError("Offering is not bound to an Approved CourseSpec version");
  const assessment = spec.assessmentItems.find((item) => item.id === assessmentItemId && item.status === "Active");
  if (!assessment) throw new PortalNotFoundError("Active assessment not found");
  return { offering, spec, assessment };
}

type Context = Awaited<ReturnType<typeof contextFor>>;

function assertGroupMode(context: Context) {
  if (context.assessment.mode === "Individual") throw new PortalConflictError("This is an Individual assessment; use the individual markbook");
}

function criterionScope(context: Context, criterionId: string): "group" | "individual" {
  if (context.assessment.mode === "Group") return "group";
  if (context.assessment.mode === "Individual") return "individual";
  return context.assessment.individualCriterionIds.includes(criterionId) ? "individual" : "group";
}

function mappedRubricHash(context: Context): string | null {
  if (!context.assessment.rubric) return null;
  const hash = rubricContentHash(context.assessment.rubric);
  const mapped = new Set(context.assessment.criterionCloMappings.map((mapping) => mapping.rubricContentHash));
  if (mapped.size > 1 || (mapped.size === 1 && !mapped.has(hash))) {
    throw new PortalConflictError("The linked rubric changed after this course specification was configured. Revise the specification before criterion grading.");
  }
  return hash;
}

function rubricCriteria(context: Context) {
  return (context.assessment.rubric?.criterionRows ?? []).map((criterion) => ({
    id: criterion.id,
    name: criterion.name,
    cloCodes: context.assessment.criterionCloMappings.filter((mapping) => mapping.rubricId === context.assessment.rubricId && mapping.criterionId === criterion.id).map((mapping) => mapping.cloCode),
    scoringScope: criterionScope(context, criterion.id),
    levels: (context.assessment.rubric?.levelRows ?? []).map((level) => ({ id: level.id, label: level.label, points: level.points })),
  }));
}

async function groupsFor(db: Db, context: Context) {
  return db.assessmentGroup.findMany({
    where: { offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id },
    include: {
      members: { orderBy: { studentNameSnapshot: "asc" } },
      score: { include: { criterionScores: true } },
      individualComponents: { include: { criterionScores: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

type Groups = Awaited<ReturnType<typeof groupsFor>>;

export function groupAssessmentReadiness(input: {
  mode: "Group" | "GroupIndividual";
  enrollmentIds: string[];
  rubricCriterionIds: Array<{ id: string; scope: "group" | "individual" }>;
  groupWeight: number | null;
  individualWeight: number | null;
  groups: Array<{
    id: string;
    memberEnrollmentIds: string[];
    hasScore: boolean;
    groupCriterionIds: string[];
    individualComponents: Array<{ enrollmentId: string; criterionIds: string[] }>;
  }>;
}) {
  const assigned = new Set(input.groups.flatMap((group) => group.memberEnrollmentIds));
  const unassignedEnrollmentIds = input.enrollmentIds.filter((id) => !assigned.has(id));
  const emptyGroupIds = input.groups.filter((group) => group.memberEnrollmentIds.length === 0).map((group) => group.id);
  const missingGroupScoreIds = input.groups.filter((group) => group.memberEnrollmentIds.length > 0 && !group.hasScore).map((group) => group.id);
  const requiredGroupCriteria = input.rubricCriterionIds.filter((item) => item.scope === "group").map((item) => item.id);
  const requiredIndividualCriteria = input.rubricCriterionIds.filter((item) => item.scope === "individual").map((item) => item.id);
  const missingGroupCriterionGroupIds = requiredGroupCriteria.length ? input.groups.filter((group) => requiredGroupCriteria.some((id) => !group.groupCriterionIds.includes(id))).map((group) => group.id) : [];
  const componentByEnrollment = new Map(input.groups.flatMap((group) => group.individualComponents.map((component) => [component.enrollmentId, component] as const)));
  const missingIndividualEnrollmentIds = input.mode === "GroupIndividual" ? input.enrollmentIds.filter((id) => !componentByEnrollment.has(id)) : [];
  const missingIndividualCriterionEnrollmentIds = input.mode === "GroupIndividual" && requiredIndividualCriteria.length ? input.enrollmentIds.filter((id) => {
    const component = componentByEnrollment.get(id);
    return !component || requiredIndividualCriteria.some((criterionId) => !component.criterionIds.includes(criterionId));
  }) : [];
  const invalidWeightConfiguration = input.mode === "GroupIndividual" && (input.groupWeight === null || input.individualWeight === null || Math.abs(input.groupWeight + input.individualWeight - 100) > 0.000001);
  return {
    readyToPublish: input.groups.length > 0 && !unassignedEnrollmentIds.length && !emptyGroupIds.length && !missingGroupScoreIds.length && !missingGroupCriterionGroupIds.length && !missingIndividualEnrollmentIds.length && !missingIndividualCriterionEnrollmentIds.length && !invalidWeightConfiguration,
    unassignedEnrollmentIds,
    emptyGroupIds,
    missingGroupScoreIds,
    missingGroupCriterionGroupIds,
    missingIndividualEnrollmentIds,
    missingIndividualCriterionEnrollmentIds,
    invalidWeightConfiguration,
  };
}

function readinessFor(context: Context, groups: Groups) {
  return groupAssessmentReadiness({
    mode: context.assessment.mode as "Group" | "GroupIndividual",
    enrollmentIds: context.offering.enrollments.map((item) => item.id),
    rubricCriterionIds: rubricCriteria(context).map((criterion) => ({ id: criterion.id, scope: criterion.scoringScope })),
    groupWeight: context.assessment.groupWeight,
    individualWeight: context.assessment.individualWeight,
    groups: groups.map((group) => ({
      id: group.id,
      memberEnrollmentIds: group.members.map((member) => member.enrollmentId),
      hasScore: Boolean(group.score),
      groupCriterionIds: group.score?.criterionScores.map((score) => score.criterionId) ?? [],
      individualComponents: group.individualComponents.map((component) => ({ enrollmentId: component.enrollmentId, criterionIds: component.criterionScores.map((score) => score.criterionId) })),
    })),
  });
}

async function audit(tx: Prisma.TransactionClient, context: Context, actorId: string, action: Parameters<typeof tx.assessmentGroupAuditEvent.create>[0]["data"]["action"], details: Prisma.InputJsonValue, options: { groupId?: string; enrollmentId?: string; reason?: string } = {}) {
  await tx.assessmentGroupAuditEvent.create({ data: { offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id, groupId: options.groupId, enrollmentId: options.enrollmentId, action, actorId, reason: options.reason ?? "", details } });
}

async function ensureCompleteMembership(context: Context, groups: Groups) {
  const assigned = new Set(groups.flatMap((group) => group.members.map((member) => member.enrollmentId)));
  const missing = context.offering.enrollments.filter((enrollment) => !assigned.has(enrollment.id));
  if (missing.length) throw new PortalConflictError(`Assign every enrolled student to a group before scoring (${missing.length} unassigned)`);
}

async function lockMembership(tx: Prisma.TransactionClient, context: Context, groups: Groups, actorId: string) {
  if (groups.every((group) => group.membershipLockedAt)) return;
  await ensureCompleteMembership(context, groups);
  const now = new Date();
  await tx.assessmentGroup.updateMany({ where: { offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id, membershipLockedAt: null }, data: { membershipLockedAt: now } });
  await audit(tx, context, actorId, "MembershipLocked", { lockedAt: now.toISOString(), groupIds: groups.map((group) => group.id) });
}

function validateSourceCriterionScores(context: Context, input: SaveAssessmentSourceCriterionScoresInput, scope: "group" | "individual") {
  if (!context.assessment.rubricId || !context.assessment.rubric) throw new PortalConflictError("This assessment has no linked rubric");
  const hash = mappedRubricHash(context)!;
  const criterionById = new Map(context.assessment.rubric.criterionRows.map((criterion) => [criterion.id, criterion]));
  const levelById = new Map(context.assessment.rubric.levelRows.map((level) => [level.id, level]));
  const maxScore = Math.max(0, ...context.assessment.rubric.levelRows.map((level) => level.points));
  if (maxScore <= 0) throw new PortalConflictError("The linked rubric has no positive scoring scale");
  const seen = new Set<string>();
  return input.scores.map((entry) => {
    if (seen.has(entry.criterionId)) throw new PortalConflictError("A rubric criterion was supplied more than once");
    seen.add(entry.criterionId);
    const criterion = criterionById.get(entry.criterionId);
    if (!criterion) throw new PortalConflictError("Unknown rubric criterion");
    if (criterionScope(context, criterion.id) !== scope) throw new PortalConflictError(`Criterion ${criterion.name} is scoped to ${criterionScope(context, criterion.id)} scoring`);
    if (entry.score > maxScore) throw new PortalConflictError(`Criterion ${criterion.name} score exceeds the rubric maximum`);
    const level = entry.rubricLevelId ? levelById.get(entry.rubricLevelId) : undefined;
    if (entry.rubricLevelId && !level) throw new PortalConflictError("Unknown rubric level");
    if (level) assertRubricLevelScoreMatches(entry.score, level.points);
    return { rubricId: context.assessment.rubricId!, criterionId: criterion.id, criterionName: criterion.name, rubricContentHash: hash, score: entry.score, maxScore, rubricLevelId: level?.id ?? null, rubricLevelLabel: level?.label ?? null };
  });
}

async function syncStudentCriterionEvidence(tx: Prisma.TransactionClient, context: Context, resultId: string, group: Groups[number], enrollmentId: string) {
  await tx.assessmentCriterionScore.deleteMany({ where: { assessmentResultId: resultId } });
  const groupScores = group.score?.criterionScores ?? [];
  const individualScores = group.individualComponents.find((component) => component.enrollmentId === enrollmentId)?.criterionScores ?? [];
  const rows = [...groupScores, ...individualScores];
  if (!rows.length) return;
  await tx.assessmentCriterionScore.createMany({ data: rows.map((score) => ({ assessmentResultId: resultId, rubricId: score.rubricId, criterionId: score.criterionId, criterionName: score.criterionName, rubricContentHash: score.rubricContentHash, score: score.score, maxScore: score.maxScore, rubricLevelId: score.rubricLevelId, rubricLevelLabel: score.rubricLevelLabel })) });
}

async function materialize(tx: Prisma.TransactionClient, context: Context, groups: Groups, actorId: string) {
  for (const group of groups) {
    if (!group.score) continue;
    for (const member of group.members) {
      const component = group.individualComponents.find((item) => item.enrollmentId === member.enrollmentId);
      if (context.assessment.mode === "GroupIndividual" && !component) continue;
      const derived = calculateDerivedGroupResult({
        mode: context.assessment.mode as "Group" | "GroupIndividual",
        groupScore: group.score.score,
        groupMaxScore: group.score.maxScore,
        groupFeedback: group.score.feedback,
        groupWeight: context.assessment.groupWeight,
        individualScore: component?.score,
        individualMaxScore: component?.maxScore,
        individualFeedback: component?.feedback,
        individualWeight: context.assessment.individualWeight,
        adjustmentPoints: component?.adjustmentPoints,
        adjustmentReason: component?.adjustmentReason,
      });
      const key = { enrollmentId: member.enrollmentId, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id };
      const existing = await tx.assessmentResult.findUnique({ where: { enrollmentId_courseSpecId_assessmentItemId: key } });
      if (existing?.publishedAt || existing?.finalizedAt) throw new PortalConflictError("Published group-derived results cannot be rematerialized through draft scoring");
      const result = existing
        ? await tx.assessmentResult.update({ where: { id: existing.id }, data: derived })
        : await tx.assessmentResult.create({ data: { ...key, ...derived } });
      await syncStudentCriterionEvidence(tx, context, result.id, group, member.enrollmentId);
    }
  }
  await audit(tx, context, actorId, "ResultsMaterialized", { groupIds: groups.map((group) => group.id) });
}

async function fullWorkspace(context: Context): Promise<GroupAssessmentWorkspace> {
  const groups = await groupsFor(prisma, context);
  const auditRows = await prisma.assessmentGroupAuditEvent.findMany({ where: { offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  const currentHash = context.assessment.rubric ? rubricContentHash(context.assessment.rubric) : null;
  return {
    offeringId: context.offering.id,
    courseSpecId: context.spec.id,
    assessmentItemId: context.assessment.id,
    assessmentName: context.assessment.name,
    mode: context.assessment.mode === "Group" ? "group" : "group_individual",
    groupWeight: context.assessment.groupWeight,
    individualWeight: context.assessment.individualWeight,
    enrollments: context.offering.enrollments.map((enrollment) => ({ enrollmentId: enrollment.id, studentId: enrollment.student.id, studentCode: enrollment.student.studentId, studentName: enrollment.student.name })),
    rubricId: context.assessment.rubricId,
    rubricName: context.assessment.rubric?.name ?? "",
    rubricContentHash: currentHash,
    rubricCriteria: rubricCriteria(context),
    groups: groups.map((group) => ({
      id: group.id, name: group.name, sortOrder: group.sortOrder,
      membershipLockedAt: group.membershipLockedAt?.toISOString() ?? null,
      publishedAt: group.publishedAt?.toISOString() ?? null,
      finalizedAt: group.finalizedAt?.toISOString() ?? null,
      members: group.members.map((member) => ({ enrollmentId: member.enrollmentId, studentId: member.studentIdSnapshot, studentCode: member.studentCodeSnapshot, studentName: member.studentNameSnapshot })),
      score: group.score ? { id: group.score.id, score: group.score.score, maxScore: group.score.maxScore, feedback: group.score.feedback, updatedAt: group.score.updatedAt.toISOString(), criterionScores: group.score.criterionScores.map((score) => ({ criterionId: score.criterionId, score: score.score, maxScore: score.maxScore, rubricLevelId: score.rubricLevelId, rubricLevelLabel: score.rubricLevelLabel })) } : null,
      individualComponents: group.individualComponents.map((component) => ({ id: component.id, enrollmentId: component.enrollmentId, score: component.score, maxScore: component.maxScore, feedback: component.feedback, adjustmentPoints: component.adjustmentPoints, adjustmentReason: component.adjustmentReason, updatedAt: component.updatedAt.toISOString(), criterionScores: component.criterionScores.map((score) => ({ criterionId: score.criterionId, score: score.score, maxScore: score.maxScore, rubricLevelId: score.rubricLevelId, rubricLevelLabel: score.rubricLevelLabel })) })),
    })),
    readiness: readinessFor(context, groups),
    audit: auditRows.map((row) => ({ id: row.id, action: row.action, groupId: row.groupId, enrollmentId: row.enrollmentId, actorName: row.actor.name, reason: row.reason, createdAt: row.createdAt.toISOString() })),
  };
}

async function groupById(db: Db, context: Context, groupId: string) {
  const group = await db.assessmentGroup.findFirst({ where: { id: groupId, offeringId: context.offering.id, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id }, include: { members: true, score: { include: { criterionScores: true } }, individualComponents: { include: { criterionScores: true } } } });
  if (!group) throw new PortalNotFoundError("Assessment group not found");
  return group;
}

async function correctStudentResult(tx: Prisma.TransactionClient, resultId: string, derived: { score: number; maxScore: number; feedback: string }, actorId: string, reason: string) {
  const result = await tx.assessmentResult.findUnique({ where: { id: resultId } });
  if (!result?.finalizedAt) throw new PortalConflictError("Affected student result is not finalized");
  if (result.score === derived.score && result.maxScore === derived.maxScore && result.feedback === derived.feedback) return;
  const correction = await tx.assessmentResultCorrection.create({ data: { assessmentResultId: result.id, beforeScore: result.score, beforeMaxScore: result.maxScore, beforeFeedback: result.feedback, afterScore: derived.score, afterMaxScore: derived.maxScore, afterFeedback: derived.feedback, reason, correctedById: actorId } });
  await tx.$queryRaw`SELECT set_config('dse.result_correction_id', ${correction.id}, true)`;
  await tx.assessmentResult.update({ where: { id: result.id }, data: derived });
}

export const groupAssessmentService = {
  async modeFor(authorId: string, programmeWide: boolean, input: PublishAssessmentResultsInput | FinalizeAssessmentResultsInput) {
    const context = await contextFor(prisma, input.offeringId, input.assessmentItemId, authorId, programmeWide);
    return context.assessment.mode;
  },

  async workspace(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string) {
    const context = await contextFor(prisma, offeringId, assessmentItemId, authorId, programmeWide);
    assertGroupMode(context);
    return fullWorkspace(context);
  },

  async replaceGroups(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, input: SaveAssessmentGroupsInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide);
      assertGroupMode(context);
      const existing = await groupsFor(tx, context);
      if (existing.some((group) => group.membershipLockedAt || group.publishedAt || group.finalizedAt || group.score || group.individualComponents.length)) throw new PortalConflictError("Group membership is locked because scoring has started");
      const legacyResults = await tx.assessmentResult.count({ where: { enrollmentId: { in: context.offering.enrollments.map((item) => item.id) }, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id } });
      if (legacyResults > 0) throw new PortalConflictError("Legacy individual draft marks exist for this Group assessment. Preserve or clear them explicitly before configuring groups; PMS will not guess historical membership.");
      const enrollmentById = new Map(context.offering.enrollments.map((item) => [item.id, item]));
      for (const group of input.groups) for (const enrollmentId of group.enrollmentIds) if (!enrollmentById.has(enrollmentId)) throw new PortalConflictError("Every group member must be enrolled in this offering");
      await tx.assessmentGroup.deleteMany({ where: { offeringId, courseSpecId: context.spec.id, assessmentItemId } });
      const created = [] as Array<{ id: string; name: string; enrollmentIds: string[] }>;
      for (const [index, group] of input.groups.entries()) {
        const row = await tx.assessmentGroup.create({ data: { id: group.id, offeringId, courseSpecId: context.spec.id, assessmentItemId, name: group.name, sortOrder: index, createdById: authorId } });
        const members = group.enrollmentIds.map((id) => enrollmentById.get(id)!);
        if (members.length) await tx.assessmentGroupMember.createMany({ data: members.map((enrollment) => ({ groupId: row.id, offeringId, courseSpecId: context.spec.id, assessmentItemId, enrollmentId: enrollment.id, studentIdSnapshot: enrollment.student.id, studentCodeSnapshot: enrollment.student.studentId, studentNameSnapshot: enrollment.student.name })) });
        created.push({ id: row.id, name: row.name, enrollmentIds: group.enrollmentIds });
      }
      await audit(tx, context, authorId, "GroupsConfigured", { groups: created });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async saveGroupScore(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, groupId: string, input: SaveAssessmentGroupScoreInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      let groups = await groupsFor(tx, context); await ensureCompleteMembership(context, groups); await lockMembership(tx, context, groups, authorId); groups = await groupsFor(tx, context);
      const group = groups.find((item) => item.id === groupId); if (!group) throw new PortalNotFoundError("Assessment group not found"); if (group.publishedAt) throw new PortalConflictError("Published group scores are locked; use the correction workflow after finalization");
      const hash = context.assessment.rubric ? mappedRubricHash(context) : null;
      await tx.assessmentGroupScore.upsert({ where: { groupId }, update: { ...input, rubricId: context.assessment.rubricId, rubricContentHash: hash, scoredById: authorId }, create: { groupId, ...input, rubricId: context.assessment.rubricId, rubricContentHash: hash, scoredById: authorId } });
      groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); await audit(tx, context, authorId, "GroupScoreSaved", { score: input.score, maxScore: input.maxScore }, { groupId });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async saveGroupCriteria(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, groupId: string, input: SaveAssessmentSourceCriterionScoresInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      let groups = await groupsFor(tx, context); await ensureCompleteMembership(context, groups); await lockMembership(tx, context, groups, authorId); groups = await groupsFor(tx, context);
      const group = groups.find((item) => item.id === groupId); if (!group?.score) throw new PortalConflictError("Save the group total score before rubric criteria"); if (group.publishedAt) throw new PortalConflictError("Published rubric evidence is immutable");
      const rows = validateSourceCriterionScores(context, input, "group");
      await tx.assessmentGroupCriterionScore.deleteMany({ where: { groupScoreId: group.score.id } });
      if (rows.length) await tx.assessmentGroupCriterionScore.createMany({ data: rows.map((row) => ({ groupScoreId: group.score!.id, ...row })) });
      groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); await audit(tx, context, authorId, "GroupCriterionScoresSaved", { criterionIds: rows.map((row) => row.criterionId) }, { groupId });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async saveIndividualComponent(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, enrollmentId: string, input: SaveAssessmentIndividualComponentInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); if (context.assessment.mode !== "GroupIndividual") throw new PortalConflictError("Individual components are only valid for Group + Individual assessments");
      let groups = await groupsFor(tx, context); await ensureCompleteMembership(context, groups); await lockMembership(tx, context, groups, authorId); groups = await groupsFor(tx, context);
      const group = groups.find((item) => item.members.some((member) => member.enrollmentId === enrollmentId)); if (!group) throw new PortalNotFoundError("Student group membership not found"); if (group.publishedAt) throw new PortalConflictError("Published individual components are locked; use the correction workflow after finalization");
      await tx.assessmentIndividualComponent.upsert({ where: { enrollmentId_courseSpecId_assessmentItemId: { enrollmentId, courseSpecId: context.spec.id, assessmentItemId } }, update: { groupId: group.id, offeringId, ...input, scoredById: authorId }, create: { groupId: group.id, offeringId, courseSpecId: context.spec.id, assessmentItemId, enrollmentId, ...input, scoredById: authorId } });
      groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); await audit(tx, context, authorId, "IndividualComponentSaved", { score: input.score, maxScore: input.maxScore, adjustmentPoints: input.adjustmentPoints }, { groupId: group.id, enrollmentId });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async saveIndividualCriteria(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, enrollmentId: string, input: SaveAssessmentSourceCriterionScoresInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`;
      const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); if (context.assessment.mode !== "GroupIndividual") throw new PortalConflictError("Individual criteria are only valid for Group + Individual assessments");
      let groups = await groupsFor(tx, context); const group = groups.find((item) => item.members.some((member) => member.enrollmentId === enrollmentId)); const component = group?.individualComponents.find((item) => item.enrollmentId === enrollmentId); if (!group || !component) throw new PortalConflictError("Save the individual component before rubric criteria"); if (group.publishedAt) throw new PortalConflictError("Published rubric evidence is immutable");
      const rows = validateSourceCriterionScores(context, input, "individual");
      await tx.assessmentIndividualCriterionScore.deleteMany({ where: { componentId: component.id } }); if (rows.length) await tx.assessmentIndividualCriterionScore.createMany({ data: rows.map((row) => ({ componentId: component.id, ...row })) });
      groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); await audit(tx, context, authorId, "IndividualCriterionScoresSaved", { criterionIds: rows.map((row) => row.criterionId) }, { groupId: group.id, enrollmentId });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async publishAssessment(authorId: string, programmeWide: boolean, input: PublishAssessmentResultsInput): Promise<PublishAssessmentResultsResponse> {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${input.offeringId} FOR UPDATE`;
      const context = await contextFor(tx, input.offeringId, input.assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      let groups = await groupsFor(tx, context); await ensureCompleteMembership(context, groups); await lockMembership(tx, context, groups, authorId); groups = await groupsFor(tx, context); await materialize(tx, context, groups, authorId); groups = await groupsFor(tx, context);
      const readiness = readinessFor(context, groups); if (!readiness.readyToPublish) throw new PortalConflictError(`Group assessment is incomplete: ${readiness.unassignedEnrollmentIds.length} unassigned, ${readiness.missingGroupScoreIds.length} missing group scores, ${readiness.missingIndividualEnrollmentIds.length} missing individual components, ${readiness.missingGroupCriterionGroupIds.length + readiness.missingIndividualCriterionEnrollmentIds.length} missing rubric evidence`);
      const enrollmentIds = context.offering.enrollments.map((item) => item.id);
      const results = await tx.assessmentResult.findMany({ where: { enrollmentId: { in: enrollmentIds }, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id } });
      if (results.length !== enrollmentIds.length) throw new PortalConflictError("Not every enrolled student has a materialized result");
      const now = new Date(); const previouslyPublishedCount = results.filter((result) => result.publishedAt).length;
      await tx.assessmentResult.updateMany({ where: { id: { in: results.filter((result) => !result.publishedAt).map((result) => result.id) }, publishedAt: null }, data: { publishedAt: now, publishedById: authorId } });
      await tx.assessmentGroup.updateMany({ where: { id: { in: groups.map((group) => group.id) } }, data: { publishedAt: now } });
      await audit(tx, context, authorId, "Published", { publishedAt: now.toISOString(), groupIds: groups.map((group) => group.id), enrollmentIds });
      return { offeringId: context.offering.id, assessmentItemId: context.assessment.id, publishedCount: results.length - previouslyPublishedCount, previouslyPublishedCount, publishedAt: now.toISOString(), publishedById: authorId };
    });
  },

  async finalizeAssessment(authorId: string, programmeWide: boolean, input: FinalizeAssessmentResultsInput): Promise<FinalizeAssessmentResultsResponse> {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${input.offeringId} FOR UPDATE`;
      const context = await contextFor(tx, input.offeringId, input.assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      const groups = await groupsFor(tx, context); const enrollmentIds = context.offering.enrollments.map((item) => item.id);
      const results = await tx.assessmentResult.findMany({ where: { enrollmentId: { in: enrollmentIds }, courseSpecId: context.spec.id, assessmentItemId: context.assessment.id } });
      if (results.length !== enrollmentIds.length || results.some((result) => !result.publishedAt || result.finalizedAt)) throw new PortalConflictError("Every student result must be published and not already finalized");
      const now = new Date(); await tx.assessmentResult.updateMany({ where: { id: { in: results.map((result) => result.id) }, finalizedAt: null }, data: { finalizedAt: now, finalizedById: authorId } });
      await tx.assessmentGroup.updateMany({ where: { id: { in: groups.map((group) => group.id) } }, data: { finalizedAt: now } });
      await audit(tx, context, authorId, "Finalized", { finalizedAt: now.toISOString(), groupIds: groups.map((group) => group.id) });
      return { offeringId: context.offering.id, assessmentItemId: context.assessment.id, finalizedCount: results.length, finalizedAt: now.toISOString(), finalizedById: authorId };
    });
  },

  async correctGroupScore(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, groupId: string, input: CorrectAssessmentGroupScoreInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`; const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); assertGroupMode(context);
      const group = await groupById(tx, context, groupId); if (!group.finalizedAt || !group.score) throw new PortalConflictError("Group source corrections are available only after finalization"); if (group.score.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new PortalConflictError("Group score changed since you opened it. Reload before correcting.");
      const correction = await tx.assessmentGroupScoreCorrection.create({ data: { groupScoreId: group.score.id, beforeScore: group.score.score, beforeMaxScore: group.score.maxScore, beforeFeedback: group.score.feedback, afterScore: input.score, afterMaxScore: input.maxScore, afterFeedback: input.feedback, reason: input.reason, correctedById: authorId } });
      await tx.$queryRaw`SELECT set_config('dse.group_score_correction_id', ${correction.id}, true)`; await tx.assessmentGroupScore.update({ where: { id: group.score.id }, data: { score: input.score, maxScore: input.maxScore, feedback: input.feedback, scoredById: authorId } });
      const refreshed = await groupById(tx, context, groupId);
      for (const member of refreshed.members) {
        const component = refreshed.individualComponents.find((item) => item.enrollmentId === member.enrollmentId);
        const derived = calculateDerivedGroupResult({ mode: context.assessment.mode as "Group" | "GroupIndividual", groupScore: input.score, groupMaxScore: input.maxScore, groupFeedback: input.feedback, groupWeight: context.assessment.groupWeight, individualScore: component?.score, individualMaxScore: component?.maxScore, individualFeedback: component?.feedback, individualWeight: context.assessment.individualWeight, adjustmentPoints: component?.adjustmentPoints, adjustmentReason: component?.adjustmentReason });
        const result = await tx.assessmentResult.findUnique({ where: { enrollmentId_courseSpecId_assessmentItemId: { enrollmentId: member.enrollmentId, courseSpecId: context.spec.id, assessmentItemId } } }); if (!result) throw new PortalConflictError("Materialized student result is missing");
        await correctStudentResult(tx, result.id, derived, authorId, `Group source correction: ${input.reason}`);
      }
      await audit(tx, context, authorId, "GroupScoreCorrected", { correctionId: correction.id, beforeScore: group.score.score, afterScore: input.score }, { groupId, reason: input.reason });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },

  async correctIndividualComponent(authorId: string, programmeWide: boolean, offeringId: string, assessmentItemId: string, enrollmentId: string, input: CorrectAssessmentIndividualComponentInput) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offeringId} FOR UPDATE`; const context = await contextFor(tx, offeringId, assessmentItemId, authorId, programmeWide); if (context.assessment.mode !== "GroupIndividual") throw new PortalConflictError("Individual source correction is only valid for Group + Individual assessments");
      const groups = await groupsFor(tx, context); const group = groups.find((item) => item.members.some((member) => member.enrollmentId === enrollmentId)); const component = group?.individualComponents.find((item) => item.enrollmentId === enrollmentId); if (!group?.finalizedAt || !component || !group.score) throw new PortalConflictError("Individual source corrections are available only after finalization"); if (component.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new PortalConflictError("Individual component changed since you opened it. Reload before correcting.");
      const correction = await tx.assessmentIndividualComponentCorrection.create({ data: { componentId: component.id, beforeScore: component.score, beforeMaxScore: component.maxScore, beforeFeedback: component.feedback, beforeAdjustmentPoints: component.adjustmentPoints, beforeAdjustmentReason: component.adjustmentReason, afterScore: input.score, afterMaxScore: input.maxScore, afterFeedback: input.feedback, afterAdjustmentPoints: input.adjustmentPoints, afterAdjustmentReason: input.adjustmentReason, reason: input.reason, correctedById: authorId } });
      await tx.$queryRaw`SELECT set_config('dse.individual_component_correction_id', ${correction.id}, true)`; await tx.assessmentIndividualComponent.update({ where: { id: component.id }, data: { score: input.score, maxScore: input.maxScore, feedback: input.feedback, adjustmentPoints: input.adjustmentPoints, adjustmentReason: input.adjustmentReason, scoredById: authorId } });
      const derived = calculateDerivedGroupResult({ mode: "GroupIndividual", groupScore: group.score.score, groupMaxScore: group.score.maxScore, groupFeedback: group.score.feedback, groupWeight: context.assessment.groupWeight, individualScore: input.score, individualMaxScore: input.maxScore, individualFeedback: input.feedback, individualWeight: context.assessment.individualWeight, adjustmentPoints: input.adjustmentPoints, adjustmentReason: input.adjustmentReason });
      const result = await tx.assessmentResult.findUnique({ where: { enrollmentId_courseSpecId_assessmentItemId: { enrollmentId, courseSpecId: context.spec.id, assessmentItemId } } }); if (!result) throw new PortalConflictError("Materialized student result is missing"); await correctStudentResult(tx, result.id, derived, authorId, `Individual source correction: ${input.reason}`);
      await audit(tx, context, authorId, "IndividualComponentCorrected", { correctionId: correction.id, beforeScore: component.score, afterScore: input.score }, { groupId: group.id, enrollmentId, reason: input.reason });
    });
    return this.workspace(authorId, programmeWide, offeringId, assessmentItemId);
  },
};
