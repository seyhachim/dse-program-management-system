import { STUDENT_CURRENT_STUDY_YEAR_TERM } from "@dse-pms/shared-types";
import type {
  AddStudentCohortMembershipInput,
  ApplyStudentCurrentStudyYearInput,
  ApplyStudentPromotionInput,
  AppendStudentProgressionInput,
  CreateStudentCohortInput,
  ExitStudentCohortMembershipInput,
  ListStudentCohortsQuery,
  ListStudentProgressionQuery,
  ListStudentCompletionOutcomesQuery,
  PreviewStudentCurrentStudyYearInput,
  PreviewStudentPromotionInput,
  RecordStudentCompletionOutcomeInput,
  StudentCurrentStudyYearApplyResult,
  StudentCurrentStudyYearPreview,
  StudentProgrammeYear,
  StudentPromotionApplyResult,
  StudentPromotionDecision,
  StudentPromotionPreview,
} from "@dse-pms/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
type PromotionDb = Pick<Prisma.TransactionClient, "studentCohort" | "studentProgressionRecord">;

export class StudentPromotionConflictError extends Error {
  constructor(public readonly blockers: string[]) {
    super(blockers.join("; ") || "Student promotion is blocked");
  }
}

export class StudentCurrentStudyYearConflictError extends Error {
  constructor(public readonly blockers: string[]) {
    super(blockers.join("; ") || "Current study year initialization is blocked");
  }
}

function resultingYear(status: StudentPromotionDecision, source: StudentProgrammeYear, target: StudentProgrammeYear) {
  if (status === "Progressed") return target;
  if (status === "Retained") return source;
  return null;
}

function currentYearFromLatest(
  latest: { programmeYear: number | null; status: string } | undefined,
): StudentProgrammeYear | null {
  if (!latest || latest.programmeYear === null) return null;
  if (latest.status === "Continuing" || latest.status === "Retained") {
    return latest.programmeYear as StudentProgrammeYear;
  }
  if (latest.status === "Progressed") return Math.min(4, latest.programmeYear + 1) as StudentProgrammeYear;
  return null;
}

const terminalProgressionStatuses = new Set(["Withdrawn", "Inactive", "Transferred", "Graduated"]);

async function buildCurrentStudyYearPreview(
  db: PromotionDb,
  cohortId: string,
  input: PreviewStudentCurrentStudyYearInput,
): Promise<StudentCurrentStudyYearPreview> {
  const cohort = await db.studentCohort.findUnique({
    where: { id: cohortId },
    include: {
      memberships: {
        include: {
          student: true,
          progressionRecords: { orderBy: [{ periodStart: "desc" }, { recordedAt: "desc" }] },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!cohort) throw Object.assign(new Error("Cohort not found"), { code: "P2025" });

  const members = cohort.memberships.map((membership) => {
    const latest = membership.progressionRecords[0];
    const base = {
      membershipId: membership.id,
      studentId: membership.student.id,
      studentNumber: membership.student.studentId,
      studentName: membership.student.name,
      latestAcademicYear: latest?.academicYear ?? null,
      latestTerm: latest?.term ?? null,
      latestProgrammeYear:
        latest?.programmeYear === null || latest?.programmeYear === undefined
          ? null
          : latest.programmeYear as StudentProgrammeYear,
      latestStatus: latest?.status ?? null,
    };

    const existingAcademicYear = membership.progressionRecords.find(
      (record) => record.academicYear === input.academicYear,
    );
    if (existingAcademicYear) {
      return {
        ...base,
        proposedProgrammeYear: null,
        programmeYearLockedByHistory: false,
        eligible: false,
        blocker: `Study year is already recorded for ${input.academicYear}`,
      };
    }

    if (membership.exitedAt) {
      return {
        ...base,
        proposedProgrammeYear: null,
        programmeYearLockedByHistory: false,
        eligible: false,
        blocker: "Cohort membership is closed",
      };
    }

    if (membership.student.status !== "Active") {
      return {
        ...base,
        proposedProgrammeYear: null,
        programmeYearLockedByHistory: false,
        eligible: false,
        blocker: `Student status is ${membership.student.status}`,
      };
    }

    if (latest && terminalProgressionStatuses.has(latest.status)) {
      return {
        ...base,
        proposedProgrammeYear: null,
        programmeYearLockedByHistory: false,
        eligible: false,
        blocker: `Latest progression status is ${latest.status}`,
      };
    }

    if (asDate(input.periodStart) < membership.joinedAt) {
      return {
        ...base,
        proposedProgrammeYear: null,
        programmeYearLockedByHistory: false,
        eligible: false,
        blocker: "Initialization period starts before cohort membership",
      };
    }

    let proposedProgrammeYear = input.defaultProgrammeYear;
    let programmeYearLockedByHistory = false;
    if (latest?.programmeYear !== null && latest?.programmeYear !== undefined) {
      if (latest.status === "Progressed") {
        proposedProgrammeYear = Math.min(4, latest.programmeYear + 1) as StudentProgrammeYear;
        programmeYearLockedByHistory = true;
      } else if (latest.status === "Retained") {
        proposedProgrammeYear = latest.programmeYear as StudentProgrammeYear;
        programmeYearLockedByHistory = true;
      }
    }

    return {
      ...base,
      proposedProgrammeYear,
      programmeYearLockedByHistory,
      eligible: true,
      blocker: null,
    };
  });

  const eligibleCount = members.filter((member) => member.eligible).length;
  return {
    cohortId: cohort.id,
    cohortCode: cohort.code,
    defaultProgrammeYear: input.defaultProgrammeYear,
    academicYear: input.academicYear,
    term: STUDENT_CURRENT_STUDY_YEAR_TERM,
    members,
    eligibleCount,
    excludedCount: members.length - eligibleCount,
    canApply: eligibleCount > 0,
  };
}

async function buildPromotionPreview(
  db: PromotionDb,
  cohortId: string,
  input: PreviewStudentPromotionInput,
): Promise<StudentPromotionPreview> {
  const cohort = await db.studentCohort.findUnique({
    where: { id: cohortId },
    include: {
      memberships: {
        include: {
          student: true,
          progressionRecords: { orderBy: [{ periodStart: "desc" }, { recordedAt: "desc" }] },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!cohort) throw Object.assign(new Error("Cohort not found"), { code: "P2025" });

  const blockers: string[] = [];
  const members = cohort.memberships.map((membership) => {
    const studentLabel = membership.student.studentId;
    const existingPeriod = membership.progressionRecords.find(
      (row) => row.academicYear === input.academicYear && row.term === input.term,
    );
    if (existingPeriod) {
      blockers.push(`${studentLabel}: progression is already recorded for ${input.academicYear} / ${input.term}`);
      return {
        membershipId: membership.id,
        studentId: membership.student.id,
        studentNumber: membership.student.studentId,
        studentName: membership.student.name,
        currentProgrammeYear: currentYearFromLatest(membership.progressionRecords[0]),
        proposedStatus: null,
        resultingProgrammeYear: null,
        eligible: false,
        blocker: "Progression already recorded for this academic period",
      };
    }

    if (membership.exitedAt) {
      return {
        membershipId: membership.id,
        studentId: membership.student.id,
        studentNumber: membership.student.studentId,
        studentName: membership.student.name,
        currentProgrammeYear: currentYearFromLatest(membership.progressionRecords[0]),
        proposedStatus: null,
        resultingProgrammeYear: null,
        eligible: false,
        blocker: "Cohort membership is closed",
      };
    }

    if (membership.student.status !== "Active") {
      return {
        membershipId: membership.id,
        studentId: membership.student.id,
        studentNumber: membership.student.studentId,
        studentName: membership.student.name,
        currentProgrammeYear: currentYearFromLatest(membership.progressionRecords[0]),
        proposedStatus: null,
        resultingProgrammeYear: null,
        eligible: false,
        blocker: `Student status is ${membership.student.status}`,
      };
    }

    const latest = membership.progressionRecords[0];
    if (latest && latest.programmeYear === null) {
      blockers.push(`${studentLabel}: latest progression record has no explicit programme year`);
      return {
        membershipId: membership.id,
        studentId: membership.student.id,
        studentNumber: membership.student.studentId,
        studentName: membership.student.name,
        currentProgrammeYear: null,
        proposedStatus: null,
        resultingProgrammeYear: null,
        eligible: false,
        blocker: "Latest progression record has no explicit programme year",
      };
    }

    if (latest && ["Withdrawn", "Inactive", "Transferred", "Graduated"].includes(latest.status)) {
      return {
        membershipId: membership.id,
        studentId: membership.student.id,
        studentNumber: membership.student.studentId,
        studentName: membership.student.name,
        currentProgrammeYear: latest.programmeYear as StudentProgrammeYear | null,
        proposedStatus: null,
        resultingProgrammeYear: null,
        eligible: false,
        blocker: `Latest progression status is ${latest.status}`,
      };
    }

    const currentProgrammeYear = latest
      ? currentYearFromLatest(latest)
      : input.sourceProgrammeYear;

    if (currentProgrammeYear !== input.sourceProgrammeYear) {
      return {
        membershipId: membership.id,
        studentId: membership.student.id,
        studentNumber: membership.student.studentId,
        studentName: membership.student.name,
        currentProgrammeYear,
        proposedStatus: null,
        resultingProgrammeYear: null,
        eligible: false,
        blocker: currentProgrammeYear
          ? `Current programme year is ${currentProgrammeYear}`
          : "Current programme year is not eligible for promotion",
      };
    }

    if (asDate(input.periodStart) < membership.joinedAt) {
      blockers.push(`${studentLabel}: promotion period starts before cohort membership`);
      return {
        membershipId: membership.id,
        studentId: membership.student.id,
        studentNumber: membership.student.studentId,
        studentName: membership.student.name,
        currentProgrammeYear,
        proposedStatus: null,
        resultingProgrammeYear: null,
        eligible: false,
        blocker: "Promotion period starts before cohort membership",
      };
    }

    return {
      membershipId: membership.id,
      studentId: membership.student.id,
      studentNumber: membership.student.studentId,
      studentName: membership.student.name,
      currentProgrammeYear,
      proposedStatus: "Progressed" as const,
      resultingProgrammeYear: input.targetProgrammeYear,
      eligible: true,
      blocker: null,
    };
  });

  const eligibleCount = members.filter((member) => member.eligible).length;
  if (eligibleCount === 0) blockers.push("No eligible students match the selected source programme year");

  return {
    cohortId: cohort.id,
    cohortCode: cohort.code,
    sourceProgrammeYear: input.sourceProgrammeYear,
    targetProgrammeYear: input.targetProgrammeYear,
    academicYear: input.academicYear,
    term: input.term,
    members,
    eligibleCount,
    excludedCount: members.length - eligibleCount,
    blockers: [...new Set(blockers)],
    canApply: blockers.length === 0 && eligibleCount > 0,
  };
}

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
        programmeYear: input.programmeYear,
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
        ...(query.programmeYear ? { programmeYear: query.programmeYear } : {}),
      },
      include: { membership: { include: { student: true } } },
      orderBy: [{ periodStart: "asc" }, { recordedAt: "asc" }],
    });
  },

  previewCurrentStudyYear(cohortId: string, input: PreviewStudentCurrentStudyYearInput) {
    return buildCurrentStudyYearPreview(prisma, cohortId, input);
  },

  async applyCurrentStudyYear(
    cohortId: string,
    input: ApplyStudentCurrentStudyYearInput,
  ): Promise<StudentCurrentStudyYearApplyResult> {
    return prisma.$transaction(async (tx) => {
      const preview = await buildCurrentStudyYearPreview(tx, cohortId, input);
      if (!preview.canApply) {
        throw new StudentCurrentStudyYearConflictError(["No eligible students need current study year initialization"]);
      }

      const eligible = preview.members.filter((member) => member.eligible);
      const eligibleIds = new Set(eligible.map((member) => member.membershipId));
      const assignmentIds = new Set(input.assignments.map((assignment) => assignment.membershipId));
      const missing = [...eligibleIds].filter((id) => !assignmentIds.has(id));
      const extra = [...assignmentIds].filter((id) => !eligibleIds.has(id));
      const blockers = [
        ...(missing.length ? [`Current study year assignments are missing ${missing.length} eligible student(s)`] : []),
        ...(extra.length ? [`Current study year assignments include ${extra.length} ineligible/cross-cohort membership(s)`] : []),
      ];

      const assignmentByMembership = new Map(
        input.assignments.map((assignment) => [assignment.membershipId, assignment]),
      );
      for (const member of eligible) {
        const assignment = assignmentByMembership.get(member.membershipId);
        if (
          assignment &&
          member.programmeYearLockedByHistory &&
          member.proposedProgrammeYear !== null &&
          assignment.programmeYear !== member.proposedProgrammeYear
        ) {
          blockers.push(
            `${member.studentNumber ?? member.studentName}: prior progression requires Year ${member.proposedProgrammeYear}`,
          );
        }
      }
      if (blockers.length) throw new StudentCurrentStudyYearConflictError(blockers);

      await tx.studentProgressionRecord.createMany({
        data: eligible.map((member) => {
          const assignment = assignmentByMembership.get(member.membershipId)!;
          return {
            membershipId: member.membershipId,
            programmeYear: assignment.programmeYear,
            academicYear: input.academicYear,
            term: STUDENT_CURRENT_STUDY_YEAR_TERM,
            periodStart: asDate(input.periodStart),
            periodEnd: asDate(input.periodEnd),
            status: "Continuing" as const,
            note: assignment.note,
          };
        }),
      });

      return {
        cohortId,
        academicYear: input.academicYear,
        term: STUDENT_CURRENT_STUDY_YEAR_TERM,
        recordsCreated: eligible.length,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },

  previewPromotion(cohortId: string, input: PreviewStudentPromotionInput) {
    return buildPromotionPreview(prisma, cohortId, input);
  },

  async applyPromotion(cohortId: string, input: ApplyStudentPromotionInput): Promise<StudentPromotionApplyResult> {
    return prisma.$transaction(async (tx) => {
      const preview = await buildPromotionPreview(tx, cohortId, input);
      if (!preview.canApply) throw new StudentPromotionConflictError(preview.blockers);

      const eligibleIds = new Set(preview.members.filter((member) => member.eligible).map((member) => member.membershipId));
      const decisionIds = new Set(input.decisions.map((decision) => decision.membershipId));
      const missing = [...eligibleIds].filter((id) => !decisionIds.has(id));
      const extra = [...decisionIds].filter((id) => !eligibleIds.has(id));
      if (missing.length || extra.length) {
        throw new StudentPromotionConflictError([
          ...(missing.length ? [`Promotion decisions are missing ${missing.length} eligible student(s)`] : []),
          ...(extra.length ? [`Promotion decisions include ${extra.length} ineligible/cross-cohort membership(s)`] : []),
        ]);
      }

      await tx.studentProgressionRecord.createMany({
        data: input.decisions.map((decision) => ({
          membershipId: decision.membershipId,
          programmeYear: input.sourceProgrammeYear,
          academicYear: input.academicYear,
          term: input.term,
          periodStart: asDate(input.periodStart),
          periodEnd: asDate(input.periodEnd),
          status: decision.status,
          note: decision.note,
        })),
      });

      const summary: Record<StudentPromotionDecision, number> = {
        Progressed: 0,
        Retained: 0,
        Withdrawn: 0,
        Inactive: 0,
        Transferred: 0,
      };
      for (const decision of input.decisions) summary[decision.status] += 1;

      return {
        cohortId,
        academicYear: input.academicYear,
        term: input.term,
        sourceProgrammeYear: input.sourceProgrammeYear,
        targetProgrammeYear: input.targetProgrammeYear,
        recordsCreated: input.decisions.length,
        summary,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
