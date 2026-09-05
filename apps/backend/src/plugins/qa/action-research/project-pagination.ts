import { Prisma } from "@prisma/client";
import type {
  ResearchCycleStatus,
  ResearchProjectListItemView,
  ResearchProjectPage,
  ResearchProjectPageQuery,
} from "@dse-pms/shared-types";
import { prisma } from "../../../core/db/prisma.ts";

export class InvalidResearchProjectPageCursorError extends Error {}

type ResearchProjectPageCursor = {
  createdAt: string;
  id: string;
};

interface ResearchProjectPageRow {
  id: string;
  programmeId: string;
  title: string;
  problemStatement: string;
  academicYear: string;
  semester: string;
  status: string;
  currentCycleStatus: ResearchCycleStatus | null;
  assignmentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function encodeResearchProjectPageCursor(cursor: ResearchProjectPageCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeResearchProjectPageCursor(cursor: string): ResearchProjectPageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as ResearchProjectPageCursor).createdAt !== "string" ||
      typeof (parsed as ResearchProjectPageCursor).id !== "string" ||
      !(parsed as ResearchProjectPageCursor).id ||
      Number.isNaN(Date.parse((parsed as ResearchProjectPageCursor).createdAt))
    ) {
      throw new Error("invalid cursor payload");
    }
    return parsed as ResearchProjectPageCursor;
  } catch {
    throw new InvalidResearchProjectPageCursorError("Invalid Action Research project page cursor");
  }
}

/** Pure page-boundary description used by the database-free pagination tests. */
export function buildResearchProjectPageQueryParts(query: ResearchProjectPageQuery) {
  return {
    programmeId: query.programmeId,
    limitWithLookahead: query.limit + 1,
    cursor: query.cursor ? decodeResearchProjectPageCursor(query.cursor) : null,
    orderBy: ["createdAt DESC", "id DESC"] as const,
  };
}

function projectListItemView(row: ResearchProjectPageRow): ResearchProjectListItemView {
  return {
    id: row.id,
    programmeId: row.programmeId,
    title: row.title,
    problemStatement: row.problemStatement,
    academicYear: row.academicYear,
    semester: row.semester,
    status: row.status,
    currentCycleStatus: row.currentCycleStatus,
    assignmentCount: row.assignmentCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * One bounded SQL read for the interactive manager list. Current-cycle status
 * and assignment count are projected in the same statement, avoiding the old
 * `getResearchProject()` per-row fan-out. Full project detail remains on the
 * existing authorized detail route.
 */
export async function listResearchProjectPage(
  query: ResearchProjectPageQuery,
): Promise<ResearchProjectPage> {
  const parts = buildResearchProjectPageQueryParts(query);
  const cursor = parts.cursor;
  const cursorBoundary = cursor
    ? Prisma.sql`
        AND (
          p."createdAt" < ${new Date(cursor.createdAt)}
          OR (p."createdAt" = ${new Date(cursor.createdAt)} AND p."id" < ${cursor.id})
        )
      `
    : Prisma.empty;

  const rows = await prisma.$queryRaw<ResearchProjectPageRow[]>(Prisma.sql`
    SELECT
      p."id",
      p."programmeId",
      p."title",
      p."problemStatement",
      p."academicYear",
      p."semester",
      p."status",
      p."createdAt",
      p."updatedAt",
      (
        SELECT c."status"
        FROM "ActionResearchCycle" c
        WHERE c."projectId" = p."id"
        ORDER BY c."cycleNumber" DESC
        LIMIT 1
      ) AS "currentCycleStatus",
      (
        SELECT COUNT(*)::int
        FROM "ActionResearchAssignment" a
        WHERE a."projectId" = p."id"
      ) AS "assignmentCount"
    FROM "ActionResearchProject" p
    WHERE p."programmeId" = ${parts.programmeId}
    ${cursorBoundary}
    ORDER BY p."createdAt" DESC, p."id" DESC
    LIMIT ${parts.limitWithLookahead}
  `);

  const hasNextPage = rows.length > query.limit;
  const visibleRows = hasNextPage ? rows.slice(0, query.limit) : rows;
  const last = visibleRows.at(-1);

  return {
    items: visibleRows.map(projectListItemView),
    nextCursor:
      hasNextPage && last
        ? encodeResearchProjectPageCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null,
  };
}
