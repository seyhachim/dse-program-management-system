import type {
  AddStudentCohortMembershipInput,
  AppendStudentProgressionInput,
  CreateStudentCohortInput,
  ExitStudentCohortMembershipInput,
  ListStudentCohortsQuery,
  ListStudentProgressionQuery,
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

  studentHistory(cohortId: string, studentId: string) {
    return prisma.studentCohortMembership.findMany({
      where: { cohortId, studentId },
      include: { cohort: true, progressionRecords: { orderBy: [{ periodStart: "asc" }, { recordedAt: "asc" }] } },
      orderBy: { joinedAt: "asc" },
    });
  },
};
