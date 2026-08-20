import { describe, expect, test } from "bun:test";
import type { PublicProgrammeFaq } from "@dse-pms/shared-types";
import { chooseAskDseResult, rankPublishedFaqs } from "./public-programme-search-service.ts";

const faqs: PublicProgrammeFaq[] = [
  {
    slug: "programming-experience",
    category: "Admission",
    question: "Do I need programming experience before I study DSE?",
    answer: "Prior programming experience is helpful but not required.",
    shortAnswer: "Programming experience is not required.",
    isFeatured: true,
    sourceLabel: null,
    sourceUrl: null,
  },
  {
    slug: "scholarships",
    category: "FeesScholarships",
    question: "Are scholarships available?",
    answer: "Published scholarship information is available here.",
    shortAnswer: null,
    isFeatured: true,
    sourceLabel: null,
    sourceUrl: null,
  },
  {
    slug: "scholarship-deadline",
    category: "FeesScholarships",
    question: "When is the scholarship application deadline?",
    answer: "Check the published scholarship deadline.",
    shortAnswer: null,
    isFeatured: false,
    sourceLabel: null,
    sourceUrl: null,
  },
  {
    slug: "career-options",
    category: "Careers",
    question: "What careers can DSE graduates pursue?",
    answer: "Graduates can pursue published DSE career pathways.",
    shortAnswer: null,
    isFeatured: false,
    sourceLabel: null,
    sourceUrl: null,
  },
];

describe("deterministic Ask DSE ranking", () => {
  test("returns an exact published FAQ as a strong direct answer", () => {
    const result = chooseAskDseResult("Are scholarships available?", faqs);
    expect(result.kind).toBe("answer");
    if (result.kind === "answer") {
      expect(result.faq.slug).toBe("scholarships");
      expect(result.score).toBe(100);
    }
  });

  test("normalizes common synonyms so Python questions match programming guidance", () => {
    const ranked = rankPublishedFaqs("need python before study?", faqs);
    expect(ranked[0]?.faq.slug).toBe("programming-experience");
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(70);
  });

  test("returns ranked suggestions when a broad scholarship question is ambiguous", () => {
    const result = chooseAskDseResult("scholarship", faqs);
    expect(result.kind).toBe("suggestions");
    if (result.kind === "suggestions") {
      expect(result.suggestions.length).toBeGreaterThan(1);
      expect(result.suggestions.map((item) => item.faq.slug)).toContain("scholarships");
      expect(result.suggestions.map((item) => item.faq.slug)).toContain("scholarship-deadline");
    }
  });

  test("returns no answer for an unrelated low-confidence question", () => {
    expect(chooseAskDseResult("is there a swimming pool open tonight?", faqs)).toEqual({ kind: "none" });
  });
});
