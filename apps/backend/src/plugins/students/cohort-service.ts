import type {
  AddStudentCohortMembershipInput,
  AppendStudentProgressionInput,
  CreateStudentCohortInput,
  ExitStudentCohortMembershipInput,
  ListStudentCohortsQuery,
  ListStudentProgressionQuery,
  ListStudentCompletionOutcomesQuery,
  RecordStudentCompletionOutcomeInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

export const studentCohortService = {
  listCohorts(query: ListStudentCohortsQuery) {
    return prisma.studentCohort.findMany({
      where: { programmeId: query.programmeId, ...(query.status ? { status: query.status } : {}) },
      include: { _count: { select: { memberships: true } } },
      orderBy: [{ intakeYear: "desc" }, { code: "asc" }],
    });
  },

  getCohort(id: string) {
    return prisma.studentCohort.findUnique({
      where: { id },
      include: {
        memberships: {
          include: { student: true, progressionRecords: { orderBy: [{ periodStart: "asc" }, { recordedAt: "asc" }] } },
          orderBy: { joinedAt: "asc" },
        },
      },
    });
  },

  createCohort(input: CreateStudentCohortInput) {
    return prisma.studentCohort.create({ data: input });
  },

  async addMembership(cohortId: string, input: AddStudentCohortMembershipInput) {
    return prisma.studentCohortMembership.create({
      data: { cohortId, studentId: input.studentId, joinedAt: asDate(input.joinedAt), note: input.note },
      include: { student: true, cohort: true },
    });
  },

  async exitMembership(cohortId: string, membershipId: string, input: ExitStudentCohortMembershipInput) {
    const membership = await prisma.studentCohortMembership.findFirst({ where: { id: membershipId, cohortId } });
    if (!membership) throw Object.assign(new Error("Cohort membership not found"), { code: "P2025" });
    if (membership.exitedAt) throw new Error("Cohort membership is already closed");
    return prisma.studentCohortMembership.update({
      where: { id: membershipId },
      data: {
        exitedAt: asDate(input.exitedAt),
        exitReason: input.exitReason,
        ...(input.note === undefined ? {} : { note: input.note }),
      },
    });
  },

  async appendProgression(cohortId: string, input: AppendStudentProgressionInput) {
    const membership = await prisma.studentCohortMembership.findFirst({ where: { id: input.membershipId, cohortId } });
    if (!membership) throw Object.assign(new Error("Cohort membership not found"), { code: "P2025" });
    return prisma.studentProgressionRecord.create({
      data: {
        membershipId: input.membershipId,
        academicYear: input.academicYear,
        term: input.term,
        periodStart: asDate(input.periodStart),
        periodEnd: asDate(input.periodEnd),
        status: input.status,
        note: input.note,
      },
      include: { membership: { include: { student: true, cohort: true } } },
    });
  },

  listProgression(cohortId: string, query: ListStudentProgressionQuery) {
    return prisma.studentProgressionRecord.findMany({
      where: {
        membership: { cohortId },
        ...(query.academicYear ? { academicYear: query.academicYear } : {}),
        ...(query.term ? { term: query.term } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: { membership: { include: { student: true } } },
      orderBy: [{ periodStart: "asc" }, { recordedAt: "asc" }],
    });
  },

  async recordCompletionOutcome(cohortId: string, input: RecordStudentCompletionOutcomeInput) {
    const membership = await prisma.studentCohortMembership.findFirst({
      where: { id: input.membershipId, cohortId },
    });
    if (!membership) throw Object.assign(new Error("Cohort membership not found"), { code: "P2025" });
    return prisma.studentCompletionOutcome.create({
      data: {
        membershipId: input.membershipId,
        outcomeType: input.outcomeType,
        outcomeDate: asDate(input.outcomeDate),
        academicYear: input.academicYear,
        awardName: input.awardName,
        note: input.note,
      },
      include: { membership: { include: { student: true, cohort: true } } },
    });
  },

  listCompletionOutcomes(cohortId: string, query: ListStudentCompletionOutcomesQuery) {
    return prisma.studentCompletionOutcome.findMany({
      where: {
        membership: { cohortId },
        ...(query.outcomeType ? { outcomeType: query.outcomeType } : {}),
        ...(query.academicYear ? { academicYear: query.academicYear } : {}),
      },
      include: { membership: { include: { student: true, cohort: true } } },
      orderBy: [{ outcomeDate: "asc" }, { recordedAt: "asc" }],
    });
  },

  async completionSummary(cohortId: string) {
    const cohort = await prisma.studentCohort.findUnique({
      where: { id: cohortId },
      select: { id: true, programmeId: true, code: true, intakeYear: true, expectedGraduationYear: true, _count: { select: { memberships: true } } },
    });
    if (!cohort) throw Object.assign(new Error("Cohort not found"), { code: "P2025" });
    const grouped = await prisma.studentCompletionOutcome.groupBy({
      by: ["outcomeType"],
      where: { membership: { cohortId } },
      _count: { _all: true },
    });
    const completionCount = grouped.find((row) => row.outcomeType === "ProgrammeCompleted")?._count._all ?? 0;
    const graduationCount = grouped.find((row) => row.outcomeType === "GraduationAwarded")?._count._all ?? 0;
    const denominator = cohort._count.memberships;
    return {
      cohortId: cohort.id, programmeId: cohort.programmeId, cohortCode: cohort.code,
      intakeYear: cohort.intakeYear, expectedGraduationYear: cohort.expectedGraduationYear,
      populationSize: denominator, completionCount, graduationCount,
      completionRate: denominator ? Math.round((completionCount / denominator) * 10000) / 100 : null,
      graduationRate: denominator ? Math.round((graduationCount / denominator) * 10000) / 100 : null,
    };
  },

  studentHistory(cohortId: string, studentId: string) {
    return prisma.studentCohortMembership.findMany({
      where: { cohortId, studentId },
      include: {
        cohort: true,
        progressionRecords: { orderBy: [{ periodStart: "asc" }, { recordedAt: "asc" }] },
        completionOutcomes: { orderBy: [{ outcomeDate: "asc" }, { recordedAt: "asc" }] },
      },
      orderBy: { joinedAt: "asc" },
    });
  },
};
