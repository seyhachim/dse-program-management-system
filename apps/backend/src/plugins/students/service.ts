import type {
  CreateStudentInput,
  ListStudentsPageQuery,
  ListStudentsQuery,
  StudentPage,
  StudentProfileInput,
  StudentRef,
  StudentStatus,
  UpdateStudentInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  canonicalStudentDisplayName,
  normalizeStudentProfileNameFields,
} from "./name.ts";
import {
  StudentRosterCursorNotFoundError,
  pageStudentRosterRows,
  sortStudentRosterRows,
} from "./roster-order.ts";

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

export const STUDENT_LIST_ORDER_SELECT = {
  ...STUDENT_LIST_SELECT,
  profile: {
    select: {
      khmerFamilyName: true,
      khmerGivenName: true,
      latinFamilyName: true,
      latinGivenName: true,
    },
  },
} as const;

export const STUDENT_REF_SELECT = {
  id: true,
  name: true,
  email: true,
  studentId: true,
  category: true,
  status: true,
  profile: true,
} as const;

type StudentPageCursor = { id: string };

export class InvalidStudentPageCursorError extends Error {}
export class InvalidStudentIdentityError extends Error {}

function assertValidIdentity(value: {
  studentId: string | null;
  email: string | null;
  status: StudentStatus;
}) {
  if (value.studentId !== null) return;
  if (value.email === null) {
    throw new InvalidStudentIdentityError(
      "Institutional email is required while Student ID is pending",
    );
  }
}

function encodeStudentPageCursor(row: { id: string }): string {
  return Buffer.from(JSON.stringify({ id: row.id }), "utf8").toString("base64url");
}

export function decodeStudentPageCursor(cursor: string): StudentPageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.id !== "string" || !parsed.id) {
      throw new Error("invalid shape");
    }
    if (parsed.createdAt !== undefined) {
      if (typeof parsed.createdAt !== "string") throw new Error("invalid legacy date");
      const createdAt = new Date(parsed.createdAt);
      if (Number.isNaN(createdAt.getTime())) throw new Error("invalid legacy date");
    }
    return { id: parsed.id };
  } catch {
    throw new InvalidStudentPageCursorError("Invalid student page cursor");
  }
}

function buildStudentListWhere(query: ListStudentsQuery) {
  const { search, activeOnly } = query;
  return {
    ...(activeOnly ? { status: "Active" as const } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { studentId: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export function buildStudentPageFindManyArgs(query: ListStudentsPageQuery) {
  return {
    where: buildStudentListWhere(query),
    select: STUDENT_LIST_ORDER_SELECT,
  };
}

function compactStudentListRow(row: {
  id: string;
  name: string;
  email: string | null;
  studentId: string | null;
  category: "Regular" | "Scholarship";
  status: StudentStatus;
  createdAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    studentId: row.studentId,
    category: row.category,
    status: row.status,
    createdAt: row.createdAt,
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
    const rows = await prisma.student.findMany({
      where: buildStudentListWhere(query),
      select: STUDENT_LIST_ORDER_SELECT,
    });
    return sortStudentRosterRows(rows).map(compactStudentListRow);
  },

  async listPage(query: ListStudentsPageQuery): Promise<StudentPage> {
    const cursor = query.cursor ? decodeStudentPageCursor(query.cursor) : null;
    const rows = await prisma.student.findMany(buildStudentPageFindManyArgs(query));

    let page;
    try {
      page = pageStudentRosterRows(rows, query.limit, cursor?.id ?? null);
    } catch (error) {
      if (error instanceof StudentRosterCursorNotFoundError) {
        throw new InvalidStudentPageCursorError("Invalid student page cursor");
      }
      throw error;
    }

    const pageRows = page.items.map(compactStudentListRow);
    return {
      items: pageRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      nextCursor:
        page.hasNextPage && page.items.length > 0
          ? encodeStudentPageCursor(page.items[page.items.length - 1]!)
          : null,
    };
  },

  async getById(id: string) {
    return prisma.student.findUnique({ where: { id }, include: withProfile });
  },

  async getByUserId(userId: string) {
    return prisma.student.findUnique({ where: { userId }, include: withProfile });
  },

  async findByIds(ids: string[]): Promise<StudentRef[]> {
    const rows = await prisma.student.findMany({
      where: { id: { in: ids } },
      select: STUDENT_REF_SELECT,
    });
    return rows.map((row) => ({
      ...row,
      profile: row.profile
        ? {
            ...row.profile,
            createdAt: row.profile.createdAt.toISOString(),
            updatedAt: row.profile.updatedAt.toISOString(),
          }
        : null,
    }));
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
