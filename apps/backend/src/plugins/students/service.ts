import type {
  CreateStudentInput,
  ListStudentsPageQuery,
  ListStudentsQuery,
  StudentPage,
  StudentProfileInput,
  StudentStatus,
  UpdateStudentInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  canonicalStudentDisplayName,
  normalizeStudentProfileNameFields,
} from "./name.ts";

const withProfile = { profile: true } as const;

export const STUDENT_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  studentId: true,
  category: true,
  status: true,
  createdAt: true,
} as const;

export const STUDENT_REF_SELECT = {
  id: true,
  name: true,
  email: true,
  studentId: true,
  category: true,
  status: true,
} as const;

type StudentPageCursor = { createdAt: Date; id: string };

export class InvalidStudentPageCursorError extends Error {}
export class InvalidStudentIdentityError extends Error {}

function assertValidIdentity(value: {
  studentId: string | null;
  email: string | null;
  status: StudentStatus;
}) {
  if (value.studentId !== null) return;
  if (value.status !== "Pending") {
    throw new InvalidStudentIdentityError(
      "Students without an official Student ID must remain Pending",
    );
  }
  if (value.email === null) {
    throw new InvalidStudentIdentityError(
      "Institutional email is required while Student ID is pending",
    );
  }
}

function encodeStudentPageCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeStudentPageCursor(cursor: string): StudentPageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string" || !parsed.id) {
      throw new Error("invalid shape");
    }
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error("invalid date");
    return { createdAt, id: parsed.id };
  } catch {
    throw new InvalidStudentPageCursorError("Invalid student page cursor");
  }
}

export function buildStudentPageFindManyArgs(query: ListStudentsPageQuery) {
  const { search, activeOnly, limit, cursor: encodedCursor } = query;
  const cursor = encodedCursor ? decodeStudentPageCursor(encodedCursor) : null;
  return {
    where: {
      ...(activeOnly ? { status: "Active" as const } : {}),
      AND: [
        ...(search
          ? [{ OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { studentId: { contains: search, mode: "insensitive" as const } },
            ] }]
          : []),
        ...(cursor
          ? [{ OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ] }]
          : []),
      ],
    },
    select: STUDENT_LIST_SELECT,
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: limit + 1,
  };
}

function hasProfileValues(profile: StudentProfileInput | undefined): boolean {
  return Boolean(profile && Object.values(profile).some((value) => value !== null && value !== undefined));
}

function mergeLatinProfile(
  existing: { latinFamilyName: string | null; latinGivenName: string | null } | null,
  patch: StudentProfileInput | undefined,
) {
  return {
    latinFamilyName:
      patch?.latinFamilyName === undefined ? existing?.latinFamilyName ?? null : patch.latinFamilyName,
    latinGivenName:
      patch?.latinGivenName === undefined ? existing?.latinGivenName ?? null : patch.latinGivenName,
  };
}

export const studentService = {
  async list(query: ListStudentsQuery) {
    const { search, activeOnly } = query;
    return prisma.student.findMany({
      where: {
        ...(activeOnly ? { status: "Active" } : {}),
        ...(search ? { OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { studentId: { contains: search, mode: "insensitive" } },
        ] } : {}),
      },
      select: STUDENT_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  async listPage(query: ListStudentsPageQuery): Promise<StudentPage> {
    const rows = await prisma.student.findMany(buildStudentPageFindManyArgs(query));
    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      items: pageRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      nextCursor:
        hasNextPage && pageRows.length > 0
          ? encodeStudentPageCursor(pageRows[pageRows.length - 1]!)
          : null,
    };
  },

  async getById(id: string) {
    return prisma.student.findUnique({ where: { id }, include: withProfile });
  },

  async getByUserId(userId: string) {
    return prisma.student.findUnique({ where: { userId }, include: withProfile });
  },

  async findByIds(ids: string[]) {
    return prisma.student.findMany({ where: { id: { in: ids } }, select: STUDENT_REF_SELECT });
  },

  async create(input: CreateStudentInput) {
    const { profile, ...student } = input;
    assertValidIdentity(student);
    const normalizedProfile = normalizeStudentProfileNameFields(profile);
    const name = canonicalStudentDisplayName(normalizedProfile, student.name);
    return prisma.student.create({
      data: {
        ...student,
        name,
        ...(hasProfileValues(normalizedProfile)
          ? { profile: { create: normalizedProfile } }
          : {}),
      },
      include: withProfile,
    });
  },

  async update(id: string, input: UpdateStudentInput) {
    const { profile, ...student } = input;
    const normalizedProfile = normalizeStudentProfileNameFields(profile);
    const hasProfilePatch =
      normalizedProfile !== undefined && Object.keys(normalizedProfile).length > 0;

    const existing = await prisma.student.findUnique({
      where: { id },
      select: {
        studentId: true,
        email: true,
        status: true,
        name: true,
        profile: { select: { latinFamilyName: true, latinGivenName: true } },
      },
    });

    if (!existing) {
      const fallbackName =
        input.name === undefined
          ? undefined
          : canonicalStudentDisplayName(normalizedProfile, input.name);
      const data = {
        ...student,
        ...(fallbackName !== undefined ? { name: fallbackName } : {}),
        ...(hasProfilePatch
          ? { profile: { upsert: { create: normalizedProfile, update: normalizedProfile } } }
          : {}),
      };
      return prisma.student.update({ where: { id }, data, include: withProfile });
    }

    assertValidIdentity({
      studentId: input.studentId === undefined ? existing.studentId : input.studentId,
      email: input.email === undefined ? existing.email : input.email,
      status: input.status === undefined ? existing.status : input.status,
    });

    const mergedLatinProfile = mergeLatinProfile(existing.profile, normalizedProfile);
    const namePatch =
      input.name !== undefined || hasProfilePatch
        ? canonicalStudentDisplayName(
            mergedLatinProfile,
            input.name === undefined ? existing.name : input.name,
          )
        : undefined;
    const data = {
      ...student,
      ...(namePatch !== undefined ? { name: namePatch } : {}),
      ...(hasProfilePatch
        ? { profile: { upsert: { create: normalizedProfile, update: normalizedProfile } } }
        : {}),
    };

    return prisma.student.update({
      where: { id },
      data,
      include: withProfile,
    });
  },

  async setStatus(id: string, status: StudentStatus) {
    const existing = await prisma.student.findUniqueOrThrow({
      where: { id },
      select: { studentId: true, email: true },
    });
    assertValidIdentity({ ...existing, status });
    return prisma.student.update({ where: { id }, data: { status }, include: withProfile });
  },

  async remove(id: string) {
    return prisma.student.delete({ where: { id } });
  },
};

export type StudentService = typeof studentService;
