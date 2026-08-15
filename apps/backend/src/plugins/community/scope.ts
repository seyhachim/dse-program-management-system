import { Prisma } from "@prisma/client";
import { prisma } from "../../core/db/prisma.ts";

export async function communityProgrammeId(communityId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ programmeId: string }[]>(Prisma.sql`
    SELECT "programmeId"
    FROM "CopCommunity"
    WHERE id = ${communityId}::uuid
  `);
  return rows[0]?.programmeId ?? null;
}

export async function discussionProgrammeId(discussionId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ programmeId: string }[]>(Prisma.sql`
    SELECT c."programmeId"
    FROM "CopDiscussion" d
    JOIN "CopCommunity" c ON c.id = d."communityId"
    WHERE d.id = ${discussionId}::uuid
  `);
  return rows[0]?.programmeId ?? null;
}

export async function actionProgrammeId(actionId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ programmeId: string }[]>(Prisma.sql`
    SELECT c."programmeId"
    FROM "CopAction" a
    JOIN "CopDiscussion" d ON d.id = a."discussionId"
    JOIN "CopCommunity" c ON c.id = d."communityId"
    WHERE a.id = ${actionId}::uuid
  `);
  return rows[0]?.programmeId ?? null;
}
