import { describe, expect, test } from "bun:test";
import type { PublicProgrammeFaq } from "@dse-pms/shared-types";
import {
  publicQuestionAnalyticsService,
  sanitizePublicQuestion,
} from "./public-question-analytics-service.ts";

const faq: PublicProgrammeFaq = {
  slug: "admission-requirements",
  category: "Admission",
  question: "What are the admission requirements?",
  answer: "Published answer",
  shortAnswer: "Published answer",
  isFeatured: true,
  sourceLabel: null,
  sourceUrl: null,
};

describe("public question analytics privacy boundary", () => {
  test("sanitizes contact details and URLs before persistence", () => {
    const result = sanitizePublicQuestion(
      "Email me at person@example.com or +855 12 345 678. See https://example.com/path",
    );

    expect(result.text).toBe("Email me at [email] or [phone]. See [url]");
    expect(result.normalized).toBe("email me at [email] or [phone] see [url]");
    expect(result.text).not.toContain("person@example.com");
    expect(result.text).not.toContain("855 12 345 678");
    expect(result.text).not.toContain("example.com/path");
  });

  test("normalizes equivalent questions for repeat grouping", () => {
    expect(sanitizePublicQuestion("  Scholarship!!! deadline? ").normalized).toBe(
      sanitizePublicQuestion("scholarship deadline").normalized,
    );
  });

  test("ignores strong direct answers instead of building a transcript log", async () => {
    await expect(
      publicQuestionAnalyticsService.observeAskDse({
        programmeId: "dse",
        source: "Telegram",
        questionText: "What are the admission requirements?",
        result: { kind: "answer", faq, score: 100 },
        answerDelivered: true,
      }),
    ).resolves.toEqual({ kind: "ignored", reason: "strong_answer" });
  });

  test("rejects a raw source event identifier at the analytics boundary", async () => {
    await expect(
      publicQuestionAnalyticsService.observeAskDse({
        programmeId: "dse",
        source: "Telegram",
        questionText: "Tell me something else",
        result: { kind: "suggestions", suggestions: [{ faq, score: 42 }] },
        answerDelivered: true,
        sourceEventKey: "telegram:update:12345",
      }),
    ).rejects.toThrow("sourceEventKey must be a purpose-specific analytics hash");
  });

  test("rejects a raw actor identifier at the analytics boundary", async () => {
    await expect(
      publicQuestionAnalyticsService.observeAskDse({
        programmeId: "dse",
        source: "Telegram",
        questionText: "Tell me something else",
        result: { kind: "none" },
        answerDelivered: true,
        analyticsActorHash: "123456789",
      }),
    ).rejects.toThrow("analyticsActorHash must be a purpose-specific analytics hash");
  });
});
