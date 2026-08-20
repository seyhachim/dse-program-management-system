import type { ProgrammeFaqCategory } from "@prisma/client";
import type { PublicProgrammeFaq } from "@dse-pms/shared-types";
import { publicProgrammeReadService } from "./public-programme-read-service.ts";

export type PublicAskDseSuggestion = {
  faq: PublicProgrammeFaq;
  score: number;
};

export type PublicAskDseResult =
  | { kind: "answer"; faq: PublicProgrammeFaq; score: number }
  | { kind: "suggestions"; suggestions: PublicAskDseSuggestion[] }
  | { kind: "none" };

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "before", "can", "do", "does", "for", "from",
  "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what",
  "when", "where", "which", "who", "will", "with", "you", "your",
]);

const SYNONYMS: Record<string, string> = {
  apply: "admission",
  application: "admission",
  applications: "admission",
  entry: "admission",
  enroll: "admission",
  enrol: "admission",
  tuition: "fees",
  cost: "fees",
  costs: "fees",
  price: "fees",
  prices: "fees",
  funding: "scholarship",
  scholarships: "scholarship",
  bursary: "scholarship",
  aid: "scholarship",
  coding: "programming",
  code: "programming",
  python: "programming",
  programmer: "programming",
  subjects: "course",
  subject: "course",
  modules: "course",
  module: "course",
  classes: "course",
  class: "course",
  jobs: "career",
  job: "career",
  employment: "career",
  careers: "career",
  professor: "lecturer",
  professors: "lecturer",
  teacher: "lecturer",
  teachers: "lecturer",
  instructor: "lecturer",
  instructors: "lecturer",
  labs: "facility",
  laboratory: "facility",
  laboratories: "facility",
  facilities: "facility",
  dates: "deadline",
  deadlines: "deadline",
};

const CATEGORY_TOKENS: Partial<Record<ProgrammeFaqCategory, string[]>> = {
  About: ["dse", "programme", "program"],
  Admission: ["admission", "requirement", "eligibility"],
  Curriculum: ["curriculum", "course", "programming"],
  Careers: ["career", "graduate", "work"],
  FeesScholarships: ["fees", "scholarship"],
  StudentLife: ["student", "life", "activity"],
  Facilities: ["facility", "lab"],
  Lecturers: ["lecturer", "staff"],
  ImportantDates: ["deadline", "date"],
  Contact: ["contact", "email", "phone"],
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function canonicalToken(token: string): string {
  if (SYNONYMS[token]) return SYNONYMS[token]!;
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokens(value: string): string[] {
  const result = normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map(canonicalToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return [...new Set(result)];
}

function overlapCount(left: string[], right: Set<string>): number {
  return left.reduce((count, token) => count + (right.has(token) ? 1 : 0), 0);
}

function scoreFaq(question: string, faq: PublicProgrammeFaq): number {
  const normalizedQuestion = normalizeText(question);
  const normalizedFaqQuestion = normalizeText(faq.question);
  if (!normalizedQuestion) return 0;
  if (normalizedQuestion === normalizedFaqQuestion) return 100;

  const queryTokens = tokens(question);
  if (!queryTokens.length) return 0;
  const questionTokens = new Set(tokens(faq.question));
  const answerTokens = new Set(tokens(`${faq.shortAnswer ?? ""} ${faq.answer}`));
  const categoryTokens = new Set((CATEGORY_TOKENS[faq.category] ?? []).map(canonicalToken));

  const questionMatches = overlapCount(queryTokens, questionTokens);
  const answerMatches = overlapCount(queryTokens, answerTokens);
  const categoryMatches = overlapCount(queryTokens, categoryTokens);
  const matched = queryTokens.filter(
    (token) => questionTokens.has(token) || answerTokens.has(token) || categoryTokens.has(token),
  ).length;
  const coverage = matched / queryTokens.length;
  const questionCoverage = questionMatches / queryTokens.length;

  let score = coverage * 60 + questionCoverage * 25;
  score += Math.min(answerMatches, 2) * 3;
  score += Math.min(categoryMatches, 2) * 4;
  if (
    normalizedFaqQuestion.includes(normalizedQuestion) ||
    normalizedQuestion.includes(normalizedFaqQuestion)
  ) {
    score += 10;
  }
  return Math.min(99, Math.round(score));
}

export function rankPublishedFaqs(
  question: string,
  faqs: PublicProgrammeFaq[],
): PublicAskDseSuggestion[] {
  return faqs
    .map((faq) => ({ faq, score: scoreFaq(question, faq) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.faq.question.localeCompare(b.faq.question));
}

export function chooseAskDseResult(
  question: string,
  faqs: PublicProgrammeFaq[],
): PublicAskDseResult {
  const ranked = rankPublishedFaqs(question, faqs);
  const first = ranked[0];
  if (!first || first.score < 35) return { kind: "none" };

  const second = ranked[1];
  const hasClearLead = !second || first.score - second.score >= 12;
  if (first.score >= 70 && hasClearLead) {
    return { kind: "answer", faq: first.faq, score: first.score };
  }

  const suggestions = ranked.filter((item) => item.score >= 35).slice(0, 3);
  return suggestions.length ? { kind: "suggestions", suggestions } : { kind: "none" };
}

export const publicProgrammeSearchService = {
  async search(programmeId: string, question: string): Promise<PublicAskDseResult> {
    const faqs = await publicProgrammeReadService.listFaqs(programmeId);
    return chooseAskDseResult(question, faqs);
  },
};

export type PublicProgrammeSearchService = typeof publicProgrammeSearchService;
