import { randomUUID } from "node:crypto";
import { Prisma, type ProgrammeFaqCategory } from "@prisma/client";
import type {
  PublicQuestionEventFilter,
  PublicQuestionEventList,
  PublicQuestionEventRecord,
  PublicQuestionFaqDraftResult,
  PublicQuestionReviewState,
  PublicQuestionSource,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import type { PublicAskDseResult } from "./public-programme-search-service.ts";

export const PUBLIC_QUESTION_RETENTION_DAYS = 180;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+?\d[\d\s().-]{6,}\d)(?!\d)/g;
const URL_PATTERN = /\bhttps?:\/\/\S+/gi;
const SAFE_HASH_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

type AnalyticsSuggestion = { rank: number; faqSlug: string; score: number };

type EventRow = {
  id: string;
  programmeId: string;
  source: PublicQuestionSource;
  questionTextSanitized: string;
  normalizedQuestion: string;
  outcome: "Suggestions" | "None";
  topMatchFaqSlug: string | null;
  topMatchScore: number | null;
  answerDelivered: boolean;
  reviewState: PublicQuestionReviewState;
  repeatCount: number;
  createdAt: Date;
  reviewedAt: Date | null;
  resolvedAt: Date | null;
};

type SuggestionRow = AnalyticsSuggestion & { eventId: string };

type EventLookupRow = {
  id: string;
  questionTextSanitized: string;
  normalizedQuestion: string;
  topMatchFaqSlug: string | null;
  reviewState: PublicQuestionReviewState;
};

export type ObservePublicQuestionInput = {
  programmeId: string;
  source: PublicQuestionSource;
  questionText: string;
  result: PublicAskDseResult;
  answerDelivered: boolean;
  /** Reserved for #492. Must be a purpose-specific HMAC, never a raw update id. */
  sourceEventKey?: string | null;
  /** Reserved for #492. Must be a purpose-specific HMAC, never a raw user/chat/IP value. */
  analyticsActorHash?: string | null;
};

export type ObservePublicQuestionResult =
  | { kind: "recorded"; eventId: string }
  | { kind: "updated"; eventId: string }
  | { kind: "ignored"; reason: "strong_answer" | "empty_after_sanitization" };

export function sanitizePublicQuestion(input: string): { text: string; normalized: string } {
  const text = input
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(URL_PATTERN, "[url]")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(PHONE_PATTERN, "[phone]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  const normalized = text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\[\] ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { text, normalized };
}

function requireSafeAnalyticsKey(value: string | null | undefined, label: string): string | null {
  if (!value) return null;
  if (!SAFE_HASH_PATTERN.test(value)) {
    throw new Error(`${label} must be a purpose-specific analytics hash`);
  }
  return value;
}

function projectResult(result: PublicAskDseResult): {
  outcome: "Suggestions" | "None";
  topMatchFaqSlug: string | null;
  topMatchScore: number | null;
  suggestions: AnalyticsSuggestion[];
} | null {
  if (result.kind === "answer") return null;
  if (result.kind === "none") {
    return { outcome: "None", topMatchFaqSlug: null, topMatchScore: null, suggestions: [] };
  }
  const suggestions = result.suggestions.slice(0, 3).map((item, index) => ({
    rank: index + 1,
    faqSlug: item.faq.slug,
    score: Math.round(item.score),
  }));
  return {
    outcome: "Suggestions",
    topMatchFaqSlug: suggestions[0]?.faqSlug ?? null,
    topMatchScore: suggestions[0]?.score ?? null,
    suggestions,
  };
}

async function purgeExpired(client: Prisma.TransactionClient | typeof prisma = prisma): Promise<void> {
  await client.$executeRaw`
    DELETE FROM public_analytics."PublicQuestionEvent"
    WHERE "createdAt" < NOW() - (${PUBLIC_QUESTION_RETENTION_DAYS} * INTERVAL '1 day')
  `;
}

function keywordsFromNormalized(value: string): string[] {
  return [...new Set(value.split(" ").filter((token) => token.length >= 3 && !token.startsWith("[")))]
    .slice(0, 8);
}

function toRecord(row: EventRow, suggestions: AnalyticsSuggestion[]): PublicQuestionEventRecord {
  return {
    id: row.id,
    programmeId: row.programmeId,
    source: row.source,
    questionTextSanitized: row.questionTextSanitized,
    normalizedQuestion: row.normalizedQuestion,
    outcome: row.outcome,
    topMatchFaqSlug: row.topMatchFaqSlug,
    topMatchScore: row.topMatchScore,
    suggestions,
    answerDelivered: row.answerDelivered,
    reviewState: row.reviewState,
    repeatCount: row.repeatCount,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export const publicQuestionAnalyticsService = {
  async observeAskDse(input: ObservePublicQuestionInput): Promise<ObservePublicQuestionResult> {
    const projected = projectResult(input.result);
    if (!projected) return { kind: "ignored", reason: "strong_answer" };

    const question = sanitizePublicQuestion(input.questionText);
    if (!question.text || !question.normalized) {
      return { kind: "ignored", reason: "empty_after_sanitization" };
    }

    const sourceEventKey = requireSafeAnalyticsKey(input.sourceEventKey, "sourceEventKey");
    const analyticsActorHash = requireSafeAnalyticsKey(input.analyticsActorHash, "analyticsActorHash");

    return prisma.$transaction(async (tx) => {
      await purgeExpired(tx);

      if (sourceEventKey) {
        const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"
          FROM public_analytics."PublicQuestionEvent"
          WHERE "sourceEventKey" = ${sourceEventKey}
          LIMIT 1
        `);
        if (existing[0]) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE public_analytics."PublicQuestionEvent"
            SET "answerDelivered" = ("answerDelivered" OR ${input.answerDelivered}),
                "updatedAt" = NOW()
            WHERE "id" = ${existing[0].id}
          `);
          return { kind: "updated" as const, eventId: existing[0].id };
        }
      }

      const eventId = randomUUID();
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO public_analytics."PublicQuestionEvent" (
          "id", "programmeId", "source", "sourceEventKey", "analyticsActorHash",
          "questionTextSanitized", "normalizedQuestion", "outcome",
          "topMatchFaqSlug", "topMatchScore", "answerDelivered"
        ) VALUES (
          ${eventId}, ${input.programmeId}, ${input.source}, ${sourceEventKey}, ${analyticsActorHash},
          ${question.text}, ${question.normalized}, ${projected.outcome},
          ${projected.topMatchFaqSlug}, ${projected.topMatchScore}, ${input.answerDelivered}
        )
      `);

      for (const suggestion of projected.suggestions) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO public_analytics."PublicQuestionSuggestion" (
            "eventId", "rank", "faqSlug", "score"
          ) VALUES (
            ${eventId}, ${suggestion.rank}, ${suggestion.faqSlug}, ${suggestion.score}
          )
        `);
      }

      return { kind: "recorded" as const, eventId };
    });
  },

  async list(
    programmeId: string,
    filters: PublicQuestionEventFilter = {},
  ): Promise<PublicQuestionEventList> {
    await purgeExpired();
    const q = filters.q?.trim().toLocaleLowerCase();
    const stateClause = filters.state
      ? Prisma.sql`AND e."reviewState" = ${filters.state}`
      : Prisma.empty;
    const queryClause = q
      ? Prisma.sql`AND (LOWER(e."questionTextSanitized") LIKE ${`%${q}%`} OR e."normalizedQuestion" LIKE ${`%${q}%`})`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<EventRow[]>(Prisma.sql`
      SELECT
        e."id", e."programmeId", e."source", e."questionTextSanitized",
        e."normalizedQuestion", e."outcome", e."topMatchFaqSlug", e."topMatchScore",
        e."answerDelivered", e."reviewState", e."createdAt", e."reviewedAt", e."resolvedAt",
        COUNT(*) OVER (
          PARTITION BY e."programmeId", e."normalizedQuestion"
        )::int AS "repeatCount"
      FROM public_analytics."PublicQuestionEvent" e
      WHERE e."programmeId" = ${programmeId}
      ${stateClause}
      ${queryClause}
      ORDER BY e."createdAt" DESC
      LIMIT 100
    `);

    if (!rows.length) return { items: [], retentionDays: PUBLIC_QUESTION_RETENTION_DAYS };

    const ids = rows.map((row) => row.id);
    const suggestionRows = await prisma.$queryRaw<SuggestionRow[]>(Prisma.sql`
      SELECT "eventId", "rank", "faqSlug", "score"
      FROM public_analytics."PublicQuestionSuggestion"
      WHERE "eventId" IN (${Prisma.join(ids)})
      ORDER BY "eventId", "rank"
    `);
    const byEvent = new Map<string, AnalyticsSuggestion[]>();
    for (const row of suggestionRows) {
      const list = byEvent.get(row.eventId) ?? [];
      list.push({ rank: row.rank, faqSlug: row.faqSlug, score: row.score });
      byEvent.set(row.eventId, list);
    }

    return {
      items: rows.map((row) => toRecord(row, byEvent.get(row.id) ?? [])),
      retentionDays: PUBLIC_QUESTION_RETENTION_DAYS,
    };
  },

  async setReviewState(
    programmeId: string,
    eventId: string,
    state: PublicQuestionReviewState,
  ): Promise<void> {
    const changed = await prisma.$executeRaw(Prisma.sql`
      UPDATE public_analytics."PublicQuestionEvent"
      SET
        "reviewState" = ${state},
        "reviewedAt" = CASE
          WHEN ${state} = 'Unreviewed' THEN NULL
          ELSE COALESCE("reviewedAt", NOW())
        END,
        "resolvedAt" = CASE
          WHEN ${state} = 'Resolved' THEN COALESCE("resolvedAt", NOW())
          ELSE NULL
        END,
        "updatedAt" = NOW()
      WHERE "id" = ${eventId} AND "programmeId" = ${programmeId}
    `);
    if (changed !== 1) throw new Error("Public question event not found");
  },

  async createFaqDraft(programmeId: string, eventId: string): Promise<PublicQuestionFaqDraftResult> {
    const rows = await prisma.$queryRaw<EventLookupRow[]>(Prisma.sql`
      SELECT "id", "questionTextSanitized", "normalizedQuestion", "topMatchFaqSlug", "reviewState"
      FROM public_analytics."PublicQuestionEvent"
      WHERE "id" = ${eventId} AND "programmeId" = ${programmeId}
      LIMIT 1
    `);
    const event = rows[0];
    if (!event) throw new Error("Public question event not found");

    const slug = `ask-dse-${event.id}`;
    const existing = await prisma.programmeFaq.findUnique({ where: { slug } });
    if (existing) {
      return { faqId: existing.id, faqSlug: existing.slug, created: false };
    }

    let category: ProgrammeFaqCategory = "About";
    if (event.topMatchFaqSlug) {
      const suggestedFaq = await prisma.programmeFaq.findFirst({
        where: { programmeId, slug: event.topMatchFaqSlug },
        select: { category: true },
      });
      if (suggestedFaq) category = suggestedFaq.category;
    }

    const created = await prisma.$transaction(async (tx) => {
      const faq = await tx.programmeFaq.create({
        data: {
          programmeId,
          category,
          slug,
          question: event.questionTextSanitized,
          answer: "",
          shortAnswer: null,
          keywords: keywordsFromNormalized(event.normalizedQuestion),
          sortOrder: 0,
          isFeatured: false,
          status: "Draft",
          sourceLabel: "Ask DSE information gap",
          sourceUrl: null,
          publishedAt: null,
          reviewedAt: null,
        },
      });
      await tx.$executeRaw(Prisma.sql`
        UPDATE public_analytics."PublicQuestionEvent"
        SET "reviewState" = 'Reviewed',
            "reviewedAt" = COALESCE("reviewedAt", NOW()),
            "updatedAt" = NOW()
        WHERE "id" = ${eventId} AND "programmeId" = ${programmeId}
      `);
      return faq;
    });

    return { faqId: created.id, faqSlug: created.slug, created: true };
  },
};

export type PublicQuestionAnalyticsService = typeof publicQuestionAnalyticsService;
