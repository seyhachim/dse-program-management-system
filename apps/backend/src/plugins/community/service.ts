import { Prisma } from "@prisma/client";
import type {
  CommunityActionStatus,
  CommunityActionView,
  CommunityDiscussionDetailView,
  CommunityDiscussionSummaryView,
  CommunityView,
  CreateCommunityActionInput,
  CreateCommunityDiscussionInput,
  CreateCommunityInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

type CommunityRow = {
  id: string;
  programmeId: string;
  name: string;
  description: string;
  category: string;
  leadership: CommunityView["leadership"];
  active: boolean;
  memberCount: bigint;
  discussionCount: bigint;
  implementedActionCount: bigint;
  isMember: boolean;
  createdAt: Date;
};

type DiscussionRow = {
  id: string;
  communityId: string;
  title: string;
  body: string;
  status: CommunityDiscussionSummaryView["status"];
  tags: string[];
  authorId: string;
  authorName: string;
  commentCount: bigint;
  actionCount: bigint;
  createdAt: Date;
};

type CommentRow = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: Date;
};

type ActionRow = {
  id: string;
  discussionId: string;
  summary: string;
  status: CommunityActionStatus;
  ownerId: string | null;
  ownerName: string | null;
  relatedCourseId: string | null;
  relatedCourseCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const toCommunityView = (row: CommunityRow): CommunityView => ({
  ...row,
  memberCount: Number(row.memberCount),
  discussionCount: Number(row.discussionCount),
  implementedActionCount: Number(row.implementedActionCount),
  createdAt: row.createdAt.toISOString(),
});

const toDiscussionView = (row: DiscussionRow): CommunityDiscussionSummaryView => ({
  ...row,
  commentCount: Number(row.commentCount),
  actionCount: Number(row.actionCount),
  createdAt: row.createdAt.toISOString(),
});

const toActionView = (row: ActionRow): CommunityActionView => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function listCommunities(programmeId: string, userId: string): Promise<CommunityView[]> {
  const rows = await prisma.$queryRaw<CommunityRow[]>(Prisma.sql`
    SELECT c.*,
      COUNT(DISTINCT m."userId") AS "memberCount",
      COUNT(DISTINCT d.id) AS "discussionCount",
      COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'Evaluated') AS "implementedActionCount",
      EXISTS(
        SELECT 1 FROM "CopMembership" mine
        WHERE mine."communityId" = c.id AND mine."userId" = ${userId}
      ) AS "isMember"
    FROM "CopCommunity" c
    LEFT JOIN "CopMembership" m ON m."communityId" = c.id
    LEFT JOIN "CopDiscussion" d ON d."communityId" = c.id
    LEFT JOIN "CopAction" a ON a."discussionId" = d.id
    WHERE c."programmeId" = ${programmeId} AND c.active = true
    GROUP BY c.id
    ORDER BY c."createdAt" DESC
  `);
  return rows.map(toCommunityView);
}

export async function getCommunity(id: string, userId: string): Promise<CommunityView | null> {
  const rows = await prisma.$queryRaw<CommunityRow[]>(Prisma.sql`
    SELECT c.*,
      COUNT(DISTINCT m."userId") AS "memberCount",
      COUNT(DISTINCT d.id) AS "discussionCount",
      COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'Evaluated') AS "implementedActionCount",
      EXISTS(
        SELECT 1 FROM "CopMembership" mine
        WHERE mine."communityId" = c.id AND mine."userId" = ${userId}
      ) AS "isMember"
    FROM "CopCommunity" c
    LEFT JOIN "CopMembership" m ON m."communityId" = c.id
    LEFT JOIN "CopDiscussion" d ON d."communityId" = c.id
    LEFT JOIN "CopAction" a ON a."discussionId" = d.id
    WHERE c.id = ${id}::uuid
    GROUP BY c.id
  `);
  return rows[0] ? toCommunityView(rows[0]) : null;
}

export async function createCommunity(input: CreateCommunityInput, userId: string): Promise<CommunityView> {
  const rows = await prisma.$queryRaw<CommunityRow[]>(Prisma.sql`
    WITH inserted AS (
      INSERT INTO "CopCommunity" (
        "programmeId", "name", "description", "category", "leadership", "createdById"
      ) VALUES (
        ${input.programmeId}, ${input.name}, ${input.description}, ${input.category}, ${input.leadership}, ${userId}
      )
      RETURNING *
    ), membership AS (
      INSERT INTO "CopMembership" ("communityId", "userId", "role")
      SELECT id, ${userId}, 'coordinator' FROM inserted
      ON CONFLICT DO NOTHING
    )
    SELECT inserted.*,
      1::bigint AS "memberCount",
      0::bigint AS "discussionCount",
      0::bigint AS "implementedActionCount",
      true AS "isMember"
    FROM inserted
  `);
  return toCommunityView(rows[0]!);
}

export async function joinCommunity(communityId: string, userId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "CopMembership" ("communityId", "userId", "role")
    VALUES (${communityId}::uuid, ${userId}, 'member')
    ON CONFLICT ("communityId", "userId") DO NOTHING
  `);
}

export async function listDiscussions(communityId: string): Promise<CommunityDiscussionSummaryView[]> {
  const rows = await prisma.$queryRaw<DiscussionRow[]>(Prisma.sql`
    SELECT d.id, d."communityId", d.title, d.body, d.status, d.tags,
      d."createdById" AS "authorId", u.name AS "authorName",
      COUNT(DISTINCT c.id) AS "commentCount",
      COUNT(DISTINCT a.id) AS "actionCount",
      d."createdAt"
    FROM "CopDiscussion" d
    JOIN "User" u ON u.id = d."createdById"
    LEFT JOIN "CopComment" c ON c."discussionId" = d.id
    LEFT JOIN "CopAction" a ON a."discussionId" = d.id
    WHERE d."communityId" = ${communityId}::uuid
    GROUP BY d.id, u.name
    ORDER BY d."createdAt" DESC
  `);
  return rows.map(toDiscussionView);
}

export async function createDiscussion(
  communityId: string,
  input: CreateCommunityDiscussionInput,
  userId: string,
): Promise<CommunityDiscussionSummaryView> {
  await joinCommunity(communityId, userId);
  const rows = await prisma.$queryRaw<DiscussionRow[]>(Prisma.sql`
    WITH inserted AS (
      INSERT INTO "CopDiscussion" ("communityId", title, body, tags, "createdById")
      VALUES (${communityId}::uuid, ${input.title}, ${input.body}, ${input.tags}, ${userId})
      RETURNING *
    )
    SELECT i.id, i."communityId", i.title, i.body, i.status, i.tags,
      i."createdById" AS "authorId", u.name AS "authorName",
      0::bigint AS "commentCount", 0::bigint AS "actionCount", i."createdAt"
    FROM inserted i JOIN "User" u ON u.id = i."createdById"
  `);
  return toDiscussionView(rows[0]!);
}

export async function getDiscussion(discussionId: string): Promise<CommunityDiscussionDetailView | null> {
  const rows = await prisma.$queryRaw<DiscussionRow[]>(Prisma.sql`
    SELECT d.id, d."communityId", d.title, d.body, d.status, d.tags,
      d."createdById" AS "authorId", u.name AS "authorName",
      COUNT(DISTINCT c.id) AS "commentCount",
      COUNT(DISTINCT a.id) AS "actionCount",
      d."createdAt"
    FROM "CopDiscussion" d
    JOIN "User" u ON u.id = d."createdById"
    LEFT JOIN "CopComment" c ON c."discussionId" = d.id
    LEFT JOIN "CopAction" a ON a."discussionId" = d.id
    WHERE d.id = ${discussionId}::uuid
    GROUP BY d.id, u.name
  `);
  if (!rows[0]) return null;

  const comments = await prisma.$queryRaw<CommentRow[]>(Prisma.sql`
    SELECT c.id, c."authorId", u.name AS "authorName", c.body, c."createdAt"
    FROM "CopComment" c
    JOIN "User" u ON u.id = c."authorId"
    WHERE c."discussionId" = ${discussionId}::uuid
    ORDER BY c."createdAt" ASC
  `);

  const actions = await listActions(discussionId);
  return {
    ...toDiscussionView(rows[0]),
    comments: comments.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    actions,
  };
}

export async function addComment(discussionId: string, body: string, userId: string) {
  const rows = await prisma.$queryRaw<CommentRow[]>(Prisma.sql`
    WITH inserted AS (
      INSERT INTO "CopComment" ("discussionId", "authorId", body)
      VALUES (${discussionId}::uuid, ${userId}, ${body})
      RETURNING *
    )
    SELECT i.id, i."authorId", u.name AS "authorName", i.body, i."createdAt"
    FROM inserted i JOIN "User" u ON u.id = i."authorId"
  `);
  const row = rows[0]!;
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export async function listActions(discussionId: string): Promise<CommunityActionView[]> {
  const rows = await prisma.$queryRaw<ActionRow[]>(Prisma.sql`
    SELECT a.id, a."discussionId", a.summary, a.status, a."ownerId", owner.name AS "ownerName",
      a."relatedCourseId", course.code AS "relatedCourseCode", a."createdAt", a."updatedAt"
    FROM "CopAction" a
    LEFT JOIN "User" owner ON owner.id = a."ownerId"
    LEFT JOIN "Course" course ON course.id = a."relatedCourseId"
    WHERE a."discussionId" = ${discussionId}::uuid
    ORDER BY a."createdAt" ASC
  `);
  return rows.map(toActionView);
}

export async function createAction(
  discussionId: string,
  input: CreateCommunityActionInput,
  userId: string,
): Promise<CommunityActionView> {
  const rows = await prisma.$queryRaw<ActionRow[]>(Prisma.sql`
    WITH inserted AS (
      INSERT INTO "CopAction" ("discussionId", summary, "ownerId", "relatedCourseId", "createdById")
      VALUES (
        ${discussionId}::uuid,
        ${input.summary},
        ${input.ownerId ?? null},
        ${input.relatedCourseId ?? null},
        ${userId}
      )
      RETURNING *
    )
    SELECT i.id, i."discussionId", i.summary, i.status, i."ownerId", owner.name AS "ownerName",
      i."relatedCourseId", course.code AS "relatedCourseCode", i."createdAt", i."updatedAt"
    FROM inserted i
    LEFT JOIN "User" owner ON owner.id = i."ownerId"
    LEFT JOIN "Course" course ON course.id = i."relatedCourseId"
  `);
  return toActionView(rows[0]!);
}

export async function updateActionStatus(actionId: string, status: CommunityActionStatus): Promise<CommunityActionView | null> {
  const rows = await prisma.$queryRaw<ActionRow[]>(Prisma.sql`
    WITH updated AS (
      UPDATE "CopAction"
      SET status = ${status}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = ${actionId}::uuid
      RETURNING *
    )
    SELECT u.id, u."discussionId", u.summary, u.status, u."ownerId", owner.name AS "ownerName",
      u."relatedCourseId", course.code AS "relatedCourseCode", u."createdAt", u."updatedAt"
    FROM updated u
    LEFT JOIN "User" owner ON owner.id = u."ownerId"
    LEFT JOIN "Course" course ON course.id = u."relatedCourseId"
  `);
  return rows[0] ? toActionView(rows[0]) : null;
}
