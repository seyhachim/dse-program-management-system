import { randomUUID } from "node:crypto";
import type {
  AddStudentCohortSectionMembershipInput,
  CreateStudentCohortSectionInput,
  ExitStudentCohortSectionMembershipInput,
  StudentCohortSectionMemberView,
  StudentCohortSectionMembershipView,
  StudentCohortSectionView,
  UpdateStudentCohortSectionInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export class StudentCohortSectionError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "CONFLICT" | "INVALID_INPUT",
    message: string,
  ) {
    super(message);
    this.name = "StudentCohortSectionError";
  }
}

type SectionRow = {
  id: string;
  cohortId: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  activeMembershipCount: bigint | number;
};

type SectionMembershipRow = {
  id: string;
  sectionId: string;
  cohortId: string;
  studentId: string;
  joinedAt: Date;
  exitedAt: Date | null;
  note: string;
  createdAt: Date;
  updatedAt: Date;
  sectionCode: string;
  sectionName: string;
  sectionActive: boolean;
};

type CohortMemberRow = {
  studentId: string;
  studentNumber: string;
  studentName: string;
  cohortJoinedAt: Date;
  cohortExitedAt: Date | null;
};

type HistoryRow = SectionMembershipRow & {
  studentNumber: string;
  studentName: string;
};

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

function sectionView(row: SectionRow): StudentCohortSectionView {
  return {
    id: row.id,
    cohortId: row.cohortId,
    code: row.code,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    activeMembershipCount: Number(row.activeMembershipCount),
  };
}

function membershipView(row: SectionMembershipRow): StudentCohortSectionMembershipView {
  return {
    id: row.id,
    sectionId: row.sectionId,
    cohortId: row.cohortId,
    studentId: row.studentId,
    joinedAt: dateOnly(row.joinedAt),
    exitedAt: row.exitedAt ? dateOnly(row.exitedAt) : null,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    section: {
      id: row.sectionId,
      code: row.sectionCode,
      name: row.sectionName,
      active: row.sectionActive,
    },
  };
}

async function sectionById(sectionId: string) {
  const rows = await prisma.$queryRaw<SectionRow[]>`
    SELECT s.*,
      (SELECT COUNT(*) FROM "StudentCohortSectionMembership" m
       WHERE m."sectionId" = s."id" AND m."exitedAt" IS NULL) AS "activeMembershipCount"
    FROM "StudentCohortSection" s
    WHERE s."id" = ${sectionId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export const studentCohortSectionService = {
  async list(cohortId: string, activeOnly = false): Promise<StudentCohortSectionView[]> {
    const cohort = await prisma.studentCohort.findUnique({ where: { id: cohortId }, select: { id: true } });
    if (!cohort) throw new StudentCohortSectionError("NOT_FOUND", "Cohort not found");
    const rows = activeOnly
      ? await prisma.$queryRaw<SectionRow[]>`
          SELECT s.*,
            (SELECT COUNT(*) FROM "StudentCohortSectionMembership" m
             WHERE m."sectionId" = s."id" AND m."exitedAt" IS NULL) AS "activeMembershipCount"
          FROM "StudentCohortSection" s
          WHERE s."cohortId" = ${cohortId} AND s."active" = TRUE
          ORDER BY s."code" ASC
        `
      : await prisma.$queryRaw<SectionRow[]>`
          SELECT s.*,
            (SELECT COUNT(*) FROM "StudentCohortSectionMembership" m
             WHERE m."sectionId" = s."id" AND m."exitedAt" IS NULL) AS "activeMembershipCount"
          FROM "StudentCohortSection" s
          WHERE s."cohortId" = ${cohortId}
          ORDER BY s."active" DESC, s."code" ASC
        `;
    return rows.map(sectionView);
  },

  async create(input: CreateStudentCohortSectionInput): Promise<StudentCohortSectionView> {
    const cohort = await prisma.studentCohort.findUnique({ where: { id: input.cohortId }, select: { id: true } });
    if (!cohort) throw new StudentCohortSectionError("NOT_FOUND", "Cohort not found");
    const id = randomUUID();
    try {
      const rows = await prisma.$queryRaw<SectionRow[]>`
        INSERT INTO "StudentCohortSection" ("id", "cohortId", "code", "name")
        VALUES (${id}, ${input.cohortId}, ${input.code.toUpperCase()}, ${input.name.trim()})
        RETURNING *, 0::bigint AS "activeMembershipCount"
      `;
      return sectionView(rows[0]!);
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) {
        throw new StudentCohortSectionError("CONFLICT", "That section code already exists in this cohort");
      }
      throw error;
    }
  },

  async update(sectionId: string, input: UpdateStudentCohortSectionInput): Promise<StudentCohortSectionView> {
    const current = await sectionById(sectionId);
    if (!current) throw new StudentCohortSectionError("NOT_FOUND", "Section not found");
    if (input.active === false && Number(current.activeMembershipCount) > 0) {
      throw new StudentCohortSectionError("CONFLICT", "Exit active section memberships before disabling this section");
    }
    const rows = await prisma.$queryRaw<SectionRow[]>`
      UPDATE "StudentCohortSection"
      SET "name" = COALESCE(${input.name?.trim() ?? null}, "name"),
          "active" = COALESCE(${input.active ?? null}, "active"),
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${sectionId}
      RETURNING *,
        (SELECT COUNT(*) FROM "StudentCohortSectionMembership" m
         WHERE m."sectionId" = ${sectionId} AND m."exitedAt" IS NULL) AS "activeMembershipCount"
    `;
    return sectionView(rows[0]!);
  },

  async listMembers(cohortId: string): Promise<StudentCohortSectionMemberView[]> {
    const cohort = await prisma.studentCohort.findUnique({ where: { id: cohortId }, select: { id: true } });
    if (!cohort) throw new StudentCohortSectionError("NOT_FOUND", "Cohort not found");
    const members = await prisma.$queryRaw<CohortMemberRow[]>`
      SELECT cm."studentId", st."studentId" AS "studentNumber", st."name" AS "studentName",
             cm."joinedAt" AS "cohortJoinedAt", cm."exitedAt" AS "cohortExitedAt"
      FROM "StudentCohortMembership" cm
      JOIN "Student" st ON st."id" = cm."studentId"
      WHERE cm."cohortId" = ${cohortId} AND cm."exitedAt" IS NULL
      ORDER BY st."studentId" ASC, st."name" ASC
    `;
    const currentRows = await prisma.$queryRaw<SectionMembershipRow[]>`
      SELECT m.*, s."code" AS "sectionCode", s."name" AS "sectionName", s."active" AS "sectionActive"
      FROM "StudentCohortSectionMembership" m
      JOIN "StudentCohortSection" s ON s."id" = m."sectionId" AND s."cohortId" = m."cohortId"
      WHERE m."cohortId" = ${cohortId} AND m."exitedAt" IS NULL
    `;
    const current = new Map(currentRows.map((row) => [row.studentId, membershipView(row)]));
    return members.map((row) => ({
      studentId: row.studentId,
      studentNumber: row.studentNumber,
      studentName: row.studentName,
      cohortJoinedAt: dateOnly(row.cohortJoinedAt),
      cohortExitedAt: row.cohortExitedAt ? dateOnly(row.cohortExitedAt) : null,
      currentSectionMembership: current.get(row.studentId) ?? null,
    }));
  },

  async listHistory(cohortId: string) {
    const rows = await prisma.$queryRaw<HistoryRow[]>`
      SELECT m.*, s."code" AS "sectionCode", s."name" AS "sectionName", s."active" AS "sectionActive",
             st."studentId" AS "studentNumber", st."name" AS "studentName"
      FROM "StudentCohortSectionMembership" m
      JOIN "StudentCohortSection" s ON s."id" = m."sectionId" AND s."cohortId" = m."cohortId"
      JOIN "Student" st ON st."id" = m."studentId"
      WHERE m."cohortId" = ${cohortId}
      ORDER BY m."joinedAt" DESC, st."studentId" ASC
    `;
    return rows.map((row) => ({
      ...membershipView(row),
      studentNumber: row.studentNumber,
      studentName: row.studentName,
    }));
  },

  async addMembership(
    sectionId: string,
    input: AddStudentCohortSectionMembershipInput,
  ): Promise<StudentCohortSectionMembershipView> {
    const joinedAt = asDate(input.joinedAt);
    return prisma.$transaction(async (tx) => {
      const sections = await tx.$queryRaw<SectionRow[]>`
        SELECT s.*,
          (SELECT COUNT(*) FROM "StudentCohortSectionMembership" m
           WHERE m."sectionId" = s."id" AND m."exitedAt" IS NULL) AS "activeMembershipCount"
        FROM "StudentCohortSection" s
        WHERE s."id" = ${sectionId}
        FOR UPDATE
      `;
      const section = sections[0];
      if (!section) throw new StudentCohortSectionError("NOT_FOUND", "Section not found");
      if (!section.active) throw new StudentCohortSectionError("CONFLICT", "Cannot assign students to a disabled section");

      const cohortMemberships = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "StudentCohortMembership"
        WHERE "cohortId" = ${section.cohortId}
          AND "studentId" = ${input.studentId}
          AND "joinedAt" <= CAST(${joinedAt} AS date)
          AND ("exitedAt" IS NULL OR "exitedAt" >= CAST(${joinedAt} AS date))
        ORDER BY "joinedAt" DESC
        LIMIT 1
        FOR UPDATE
      `;
      if (!cohortMemberships[0]) {
        throw new StudentCohortSectionError(
          "INVALID_INPUT",
          "Student must have canonical membership in this cohort on the section joining date",
        );
      }

      const overlap = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "StudentCohortSectionMembership"
        WHERE "cohortId" = ${section.cohortId}
          AND "studentId" = ${input.studentId}
          AND ("exitedAt" IS NULL OR "exitedAt" >= CAST(${joinedAt} AS date))
        LIMIT 1
        FOR UPDATE
      `;
      if (overlap[0]) {
        throw new StudentCohortSectionError(
          "CONFLICT",
          "Student already has an overlapping section membership in this cohort",
        );
      }

      const id = randomUUID();
      const rows = await tx.$queryRaw<SectionMembershipRow[]>`
        INSERT INTO "StudentCohortSectionMembership"
          ("id", "sectionId", "cohortId", "studentId", "joinedAt", "note")
        VALUES (${id}, ${section.id}, ${section.cohortId}, ${input.studentId}, CAST(${joinedAt} AS date), ${input.note.trim()})
        RETURNING *, ${section.code}::text AS "sectionCode", ${section.name}::text AS "sectionName", ${section.active}::boolean AS "sectionActive"
      `;
      return membershipView(rows[0]!);
    });
  },

  async exitMembership(
    sectionId: string,
    membershipId: string,
    input: ExitStudentCohortSectionMembershipInput,
  ): Promise<StudentCohortSectionMembershipView> {
    const exitedAt = asDate(input.exitedAt);
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<SectionMembershipRow[]>`
        SELECT m.*, s."code" AS "sectionCode", s."name" AS "sectionName", s."active" AS "sectionActive"
        FROM "StudentCohortSectionMembership" m
        JOIN "StudentCohortSection" s ON s."id" = m."sectionId" AND s."cohortId" = m."cohortId"
        WHERE m."id" = ${membershipId} AND m."sectionId" = ${sectionId}
        LIMIT 1
        FOR UPDATE OF m
      `;
      const current = rows[0];
      if (!current) throw new StudentCohortSectionError("NOT_FOUND", "Section membership not found");
      if (current.exitedAt) throw new StudentCohortSectionError("CONFLICT", "Section membership is already closed");
      if (exitedAt < current.joinedAt) {
        throw new StudentCohortSectionError("INVALID_INPUT", "Section exit date cannot precede joining date");
      }
      const updated = await tx.$queryRaw<SectionMembershipRow[]>`
        UPDATE "StudentCohortSectionMembership"
        SET "exitedAt" = CAST(${exitedAt} AS date),
            "note" = CASE WHEN ${input.note !== undefined} THEN ${input.note?.trim() ?? ""} ELSE "note" END,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${membershipId}
        RETURNING *, ${current.sectionCode}::text AS "sectionCode", ${current.sectionName}::text AS "sectionName", ${current.sectionActive}::boolean AS "sectionActive"
      `;
      return membershipView(updated[0]!);
    });
  },
};
