import { Prisma } from "@prisma/client";
import type {
  Role,
  TelegramAnalyticsDashboard,
  TelegramUsageEventType,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { PUBLIC_QUESTION_RETENTION_DAYS } from "./public-question-analytics-service.ts";

const RETENTION_DAYS = PUBLIC_QUESTION_RETENTION_DAYS;

type MiniSummaryRow = {
  totalEvents: number;
  opens: number;
  uniqueUsers: number;
};

type RoleRow = {
  role: Role;
  eventCount: number;
  uniqueUsers: number;
};

type EventRow = {
  eventType: TelegramUsageEventType;
  count: number;
};

type QuestionSummaryRow = {
  informationGapQuestions: number;
  lowConfidence: number;
  noMatch: number;
  unresolved: number;
};

type UnresolvedRow = {
  normalizedQuestion: string;
  sampleQuestion: string;
  count: number;
};

async function purgeExpired(): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM public_analytics."TelegramUsageEvent"
      WHERE "createdAt" < NOW() - (${RETENTION_DAYS} * INTERVAL '1 day')
    `),
    prisma.$executeRaw(Prisma.sql`
      DELETE FROM public_analytics."PublicQuestionEvent"
      WHERE "createdAt" < NOW() - (${RETENTION_DAYS} * INTERVAL '1 day')
    `),
  ]);
}

export const telegramAnalyticsService = {
  async dashboard(programmeId: string, days: number): Promise<TelegramAnalyticsDashboard> {
    await purgeExpired();

    const range = Prisma.sql`NOW() - (${days} * INTERVAL '1 day')`;
    const [miniSummaryRows, roleRows, eventRows, questionSummaryRows, unresolvedRows] =
      await Promise.all([
        prisma.$queryRaw<MiniSummaryRow[]>(Prisma.sql`
          SELECT
            COUNT(*)::int AS "totalEvents",
            COUNT(*) FILTER (WHERE "eventType" = 'MiniAppOpened')::int AS "opens",
            COUNT(DISTINCT "actorUserId") FILTER (WHERE "actorUserId" IS NOT NULL)::int AS "uniqueUsers"
          FROM public_analytics."TelegramUsageEvent"
          WHERE "programmeId" = ${programmeId}
            AND "createdAt" >= ${range}
        `),
        prisma.$queryRaw<RoleRow[]>(Prisma.sql`
          SELECT
            "actorRole" AS "role",
            COUNT(*)::int AS "eventCount",
            COUNT(DISTINCT "actorUserId") FILTER (WHERE "actorUserId" IS NOT NULL)::int AS "uniqueUsers"
          FROM public_analytics."TelegramUsageEvent"
          WHERE "programmeId" = ${programmeId}
            AND "createdAt" >= ${range}
          GROUP BY "actorRole"
          ORDER BY "eventCount" DESC, "actorRole" ASC
        `),
        prisma.$queryRaw<EventRow[]>(Prisma.sql`
          SELECT "eventType", COUNT(*)::int AS "count"
          FROM public_analytics."TelegramUsageEvent"
          WHERE "programmeId" = ${programmeId}
            AND "createdAt" >= ${range}
          GROUP BY "eventType"
          ORDER BY "count" DESC, "eventType" ASC
          LIMIT 10
        `),
        prisma.$queryRaw<QuestionSummaryRow[]>(Prisma.sql`
          SELECT
            COUNT(*)::int AS "informationGapQuestions",
            COUNT(*) FILTER (WHERE "outcome" = 'Suggestions')::int AS "lowConfidence",
            COUNT(*) FILTER (WHERE "outcome" = 'None')::int AS "noMatch",
            COUNT(*) FILTER (WHERE "reviewState" <> 'Resolved')::int AS "unresolved"
          FROM public_analytics."PublicQuestionEvent"
          WHERE "programmeId" = ${programmeId}
            AND "createdAt" >= ${range}
        `),
        prisma.$queryRaw<UnresolvedRow[]>(Prisma.sql`
          SELECT
            "normalizedQuestion",
            MIN("questionTextSanitized") AS "sampleQuestion",
            COUNT(*)::int AS "count"
          FROM public_analytics."PublicQuestionEvent"
          WHERE "programmeId" = ${programmeId}
            AND "createdAt" >= ${range}
            AND "reviewState" <> 'Resolved'
          GROUP BY "normalizedQuestion"
          ORDER BY "count" DESC, "normalizedQuestion" ASC
          LIMIT 8
        `),
      ]);

    const mini = miniSummaryRows[0] ?? { totalEvents: 0, opens: 0, uniqueUsers: 0 };
    const questions = questionSummaryRows[0] ?? {
      informationGapQuestions: 0,
      lowConfidence: 0,
      noMatch: 0,
      unresolved: 0,
    };

    return {
      programmeId,
      periodDays: days,
      retentionDays: RETENTION_DAYS,
      miniApp: {
        totalEvents: mini.totalEvents,
        opens: mini.opens,
        uniqueUsers: mini.uniqueUsers,
        roleBreakdown: roleRows,
        topEvents: eventRows,
      },
      askDse: {
        informationGapQuestions: questions.informationGapQuestions,
        lowConfidence: questions.lowConfidence,
        noMatch: questions.noMatch,
        unresolved: questions.unresolved,
        topUnresolved: unresolvedRows,
      },
    };
  },
};

export type TelegramAnalyticsService = typeof telegramAnalyticsService;
