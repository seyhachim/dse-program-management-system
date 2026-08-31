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

const withProfile = { profile: true } as const;

/** Compact projection used by interactive roster lists. */
export const STUDENT_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  studentId: true,
  status: true,
  createdAt: true,
} as const;

/** Exact cross-plugin StudentRef projection; never hydrate profile data for joins. */
export const STUDENT_REF_SELECT = {
  id: true,
  name: true,
  email: true,
  studentId: true,
  status: true,
} as const;

type StudentPageCursor = {
  createdAt: Date;
  id: string;
};

export class InvalidStudentPageCursorError extends Error {}

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

/**
 * Build the bounded Prisma read independently from the database call so cursor,
 * filter, ordering, and look-ahead behaviour can be unit-tested without a live
 * DATABASE_URL. The service remains the only caller that executes this query.
 */
export function buildStudentPageFindManyArgs(query: ListStudentsPageQuery) {
  const { search, activeOnly, limit, cursor: encodedCursor } = query;
  const cursor = encodedCursor ? decodeStudentPageCursor(encodedCursor) : null;

  return {
    where: {
      ...(activeOnly ? { status: "Active" as const } : {}),
      AND: [
        ...(search
          ? [
              {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { email: { contains: search, mode: "insensitive" as const } },
                  { studentId: { contains: search, mode: "insensitive" as const } },
                ],
              },
            ]
          : []),
        ...(cursor
          ? [
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    select: STUDENT_LIST_SELECT,
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: limit + 1,
  };
}

function hasProfileValues(profile: StudentProfileInput | undefined): boolean {
  return Boolean(
    profile && Object.values(profile).some((value) => value !== null && value !== undefined),
  );
}

/**
 * Students business logic over Prisma. This object is the plugin's public
 * service surface — it is what other plugins receive from
 * `registry.get("students").service`, so its method signatures are the
 * cross-plugin contract.
 */
export const studentService = {
  /** Legacy full-list service kept for existing cross-plugin/non-interactive consumers. */
  async list(query: ListStudentsQuery) {
    const { search, activeOnly } = query;
    return prisma.student.findMany({
      where: {
        ...(activeOnly ? { status: "Active" } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { studentId: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: STUDENT_LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  },

  /**
   * Bounded interactive roster read ordered by `(createdAt DESC, id DESC)`.
   * The composite opaque cursor keeps navigation deterministic for equal
   * timestamps and prevents concurrent inserts ahead of the current page from
   * shifting rows between already-visited pages.
   */
  async listPage(query: ListStudentsPageQuery): Promise<StudentPage> {
    const rows = await prisma.student.findMany(buildStudentPageFindManyArgs(query));
    const hasNextPage = rows.length > query.limit;
    const pageRows = hasNextPage ? rows.slice(0, query.limit) : rows;
    return {
      items: pageRows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
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
    return prisma.student.findMany({
      where: { id: { in: ids } },
      select: STUDENT_REF_SELECT,
    });
  },

  async create(input: CreateStudentInput) {
    const { profile, ...student } = input;
    return prisma.student.create({
      data: {
        ...student,
        ...(hasProfileValues(profile) ? { profile: { create: profile } } : {}),
      },
      include: withProfile,
    });
  },

  async update(id: string, input: UpdateStudentInput) {
    const { profile, ...student } = input;
    const hasProfilePatch = profile !== undefined && Object.keys(profile).length > 0;
    return prisma.student.update({
      where: { id },
      data: {
        ...student,
        ...(hasProfilePatch
          ? {
              profile: {
                upsert: {
                  create: profile,
                  update: profile,
                },
              },
            }
          : {}),
      },
      include: withProfile,
    });
  },

  async setStatus(id: string, status: StudentStatus) {
    return prisma.student.update({
      where: { id },
      data: { status },
      include: withProfile,
    });
  },

  async remove(id: string) {
    return prisma.student.delete({ where: { id } });
  },
};

export type StudentService = typeof studentService;