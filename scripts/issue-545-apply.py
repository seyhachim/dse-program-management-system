from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding='utf-8')

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8')

def rep(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)

# Prisma schema: additive nullable Khmer presentation fields on the same logical records.
p = 'apps/backend/prisma/schema.prisma'
s = read(p)
s = rep(s, '''  question    String\n  answer      String\n  shortAnswer String?\n  keywords    String[]                         @default([])''', '''  question      String\n  answer        String\n  shortAnswer   String?\n  keywords      String[]                         @default([])\n  questionKm    String?\n  answerKm      String?\n  shortAnswerKm String?\n  keywordsKm    String[]                         @default([])''', 'schema faq fields')
s = rep(s, '''  kind        ProgrammeImportantDateKind\n  title       String\n  description String                           @default(\"\")\n  date        DateTime''', '''  kind          ProgrammeImportantDateKind\n  title         String\n  description   String                           @default(\"\")\n  titleKm       String?\n  descriptionKm String?\n  date          DateTime''', 'schema date fields')
s = rep(s, '''  programmeName  String\n  shortName      String\n  overview       String    @default(\"\")\n  admissionEmail String?''', '''  programmeName   String\n  shortName       String\n  overview        String    @default(\"\")\n  programmeNameKm String?\n  shortNameKm     String?\n  overviewKm      String?\n  admissionEmail  String?''', 'schema profile fields')
s = rep(s, '''  facebookUrl    String?\n  campusAddress  String?\n  mapUrl         String?''', '''  facebookUrl     String?\n  campusAddress   String?\n  campusAddressKm String?\n  mapUrl          String?''', 'schema profile address')
write(p, s)

# Additive migration: no backfill, no lifecycle split.
write('apps/backend/prisma/migrations/20260822124500_add_public_programme_khmer_content/migration.sql', '''-- Issue #545: additive bilingual public programme content.\n-- English fields remain authoritative fallback; NULL Khmer fields mean \"use English\".\nALTER TABLE \"ProgrammeFaq\"\n  ADD COLUMN \"questionKm\" TEXT,\n  ADD COLUMN \"answerKm\" TEXT,\n  ADD COLUMN \"shortAnswerKm\" TEXT,\n  ADD COLUMN \"keywordsKm\" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];\n\nALTER TABLE \"ProgrammeImportantDate\"\n  ADD COLUMN \"titleKm\" TEXT,\n  ADD COLUMN \"descriptionKm\" TEXT;\n\nALTER TABLE \"ProgrammePublicProfile\"\n  ADD COLUMN \"programmeNameKm\" TEXT,\n  ADD COLUMN \"shortNameKm\" TEXT,\n  ADD COLUMN \"overviewKm\" TEXT,\n  ADD COLUMN \"campusAddressKm\" TEXT;\n''')

# Shared contracts.
p = 'packages/shared-types/src/public-programme-info.ts'
s = read(p)
s = rep(s, 'export type ProgrammePublicPublicationStatus = z.infer<\n  typeof ProgrammePublicPublicationStatusSchema\n>;\n', 'export type ProgrammePublicPublicationStatus = z.infer<\n  typeof ProgrammePublicPublicationStatusSchema\n>;\n\nexport const PublicProgrammeLocaleSchema = z.enum([\"en\", \"km\"]);\nexport type PublicProgrammeLocale = z.infer<typeof PublicProgrammeLocaleSchema>;\n', 'locale schema')
s = rep(s, '''  shortAnswer: z.string().trim().max(1000).nullable().optional(),\n  keywords: z.array(z.string().trim().min(1).max(80)).default([]),\n  sortOrder:''', '''  shortAnswer: z.string().trim().max(1000).nullable().optional(),\n  keywords: z.array(z.string().trim().min(1).max(80)).default([]),\n  questionKm: z.string().trim().max(500).nullable().optional(),\n  answerKm: z.string().trim().nullable().optional(),\n  shortAnswerKm: z.string().trim().max(1000).nullable().optional(),\n  keywordsKm: z.array(z.string().trim().min(1).max(80)).default([]),\n  sortOrder:''', 'faq input km')
s = rep(s, '''    title: z.string().trim().min(1).max(200),\n    description: z.string().trim().max(2000).default(\"\"),\n    date:''', '''    title: z.string().trim().min(1).max(200),\n    description: z.string().trim().max(2000).default(\"\"),\n    titleKm: z.string().trim().max(200).nullable().optional(),\n    descriptionKm: z.string().trim().max(2000).nullable().optional(),\n    date:''', 'date input km')
s = rep(s, '''  overview: z.string().trim().default(\"\"),\n  admissionEmail:''', '''  overview: z.string().trim().default(\"\"),\n  programmeNameKm: z.string().trim().max(300).nullable().optional(),\n  shortNameKm: z.string().trim().max(80).nullable().optional(),\n  overviewKm: z.string().trim().nullable().optional(),\n  admissionEmail:''', 'profile input km')
s = rep(s, '''  campusAddress: z.string().trim().max(1000).nullable().optional(),\n  mapUrl:''', '''  campusAddress: z.string().trim().max(1000).nullable().optional(),\n  campusAddressKm: z.string().trim().max(1000).nullable().optional(),\n  mapUrl:''', 'profile input address km')
# Admin write schemas (same patterns appear a second time).
s = rep(s, '''  shortAnswer: z.string().trim().max(1000).nullable().optional(),\n  keywords: z.array(z.string().trim().min(1).max(80)).default([]),\n  sortOrder:''', '''  shortAnswer: z.string().trim().max(1000).nullable().optional(),\n  keywords: z.array(z.string().trim().min(1).max(80)).default([]),\n  questionKm: z.string().trim().max(500).nullable().optional(),\n  answerKm: z.string().trim().nullable().optional(),\n  shortAnswerKm: z.string().trim().max(1000).nullable().optional(),\n  keywordsKm: z.array(z.string().trim().min(1).max(80)).default([]),\n  sortOrder:''', 'faq admin km')
s = rep(s, '''    title: z.string().trim().min(1, \"Title is required\").max(200),\n    description: z.string().trim().max(2000).default(\"\"),\n    date:''', '''    title: z.string().trim().min(1, \"Title is required\").max(200),\n    description: z.string().trim().max(2000).default(\"\"),\n    titleKm: z.string().trim().max(200).nullable().optional(),\n    descriptionKm: z.string().trim().max(2000).nullable().optional(),\n    date:''', 'date admin km')
s = rep(s, '''  overview: z.string().trim().default(\"\"),\n  admissionEmail: z.string().trim().email().nullable().optional(),''', '''  overview: z.string().trim().default(\"\"),\n  programmeNameKm: z.string().trim().max(300).nullable().optional(),\n  shortNameKm: z.string().trim().max(80).nullable().optional(),\n  overviewKm: z.string().trim().nullable().optional(),\n  admissionEmail: z.string().trim().email().nullable().optional(),''', 'profile admin km')
s = rep(s, '''  campusAddress: z.string().trim().max(1000).nullable().optional(),\n  mapUrl: optionalTrimmedUrl,''', '''  campusAddress: z.string().trim().max(1000).nullable().optional(),\n  campusAddressKm: z.string().trim().max(1000).nullable().optional(),\n  mapUrl: optionalTrimmedUrl,''', 'profile admin address km')
s = rep(s, '''export const PublicProgrammeFaqQuerySchema = z.object({\n  category: ProgrammeFaqCategorySchema.optional(),\n  featured: z.enum([\"true\", \"false\"]).transform((value) => value === \"true\").optional(),\n});''', '''export const PublicProgrammeLocaleQuerySchema = z.object({\n  locale: PublicProgrammeLocaleSchema.optional(),\n});\nexport type PublicProgrammeLocaleQuery = z.infer<typeof PublicProgrammeLocaleQuerySchema>;\n\nexport const PublicProgrammeFaqQuerySchema = z.object({\n  category: ProgrammeFaqCategorySchema.optional(),\n  featured: z.enum([\"true\", \"false\"]).transform((value) => value === \"true\").optional(),\n  locale: PublicProgrammeLocaleSchema.optional(),\n});''', 'faq query locale')
s = rep(s, '''export const PublicProgrammeImportantDateQuerySchema = z.object({\n  kind: ProgrammeImportantDateKindSchema.optional(),\n});''', '''export const PublicProgrammeImportantDateQuerySchema = z.object({\n  kind: ProgrammeImportantDateKindSchema.optional(),\n  locale: PublicProgrammeLocaleSchema.optional(),\n});''', 'date query locale')
write(p, s)

# Admin persistence maps translations onto the same row/lifecycle.
p = 'apps/backend/src/plugins/programme/public-programme-info-service.ts'
s = read(p)
s = rep(s, '''    shortAnswer: nullable(input.shortAnswer),\n    keywords: input.keywords,\n    sortOrder:''', '''    shortAnswer: nullable(input.shortAnswer),\n    keywords: input.keywords,\n    questionKm: nullable(input.questionKm),\n    answerKm: nullable(input.answerKm),\n    shortAnswerKm: nullable(input.shortAnswerKm),\n    keywordsKm: input.keywordsKm,\n    sortOrder:''', 'service faq km')
s = rep(s, '''    title: input.title,\n    description: input.description,\n    date:''', '''    title: input.title,\n    description: input.description,\n    titleKm: nullable(input.titleKm),\n    descriptionKm: nullable(input.descriptionKm),\n    date:''', 'service date km')
s = rep(s, '''    shortName: input.shortName,\n    overview: input.overview,\n    admissionEmail:''', '''    shortName: input.shortName,\n    overview: input.overview,\n    programmeNameKm: nullable(input.programmeNameKm),\n    shortNameKm: nullable(input.shortNameKm),\n    overviewKm: nullable(input.overviewKm),\n    admissionEmail:''', 'service profile km')
s = rep(s, '''    campusAddress: nullable(input.campusAddress),\n    mapUrl:''', '''    campusAddress: nullable(input.campusAddress),\n    campusAddressKm: nullable(input.campusAddressKm),\n    mapUrl:''', 'service profile address km')
write(p, s)

# Replace read service with locale-aware display shaping. Published filter remains the boundary.
write('apps/backend/src/plugins/programme/public-programme-read-service.ts', r'''import {
  ProgrammeFaqCategory,
  ProgrammePublicPublicationStatus,
  type Prisma,
} from "@prisma/client";
import type {
  PublicProgrammeAdmission,
  PublicProgrammeContact,
  PublicProgrammeFaq,
  PublicProgrammeFaqCategorySummary,
  PublicProgrammeFaqQuery,
  PublicProgrammeFeesScholarships,
  PublicProgrammeImportantDate,
  PublicProgrammeImportantDateQuery,
  PublicProgrammeLocale,
  PublicProgrammeProfile,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export class PublicProgrammeReadNotFoundError extends Error {}

const publicFaqSelect = {
  slug: true, category: true, question: true, answer: true, shortAnswer: true,
  keywords: true, questionKm: true, answerKm: true, shortAnswerKm: true, keywordsKm: true,
  isFeatured: true, sourceLabel: true, sourceUrl: true,
} satisfies Prisma.ProgrammeFaqSelect;

const publicImportantDateSelect = {
  kind: true, title: true, description: true, titleKm: true, descriptionKm: true,
  date: true, endDate: true,
} satisfies Prisma.ProgrammeImportantDateSelect;

const publicProfileSelect = {
  programmeName: true, shortName: true, overview: true,
  programmeNameKm: true, shortNameKm: true, overviewKm: true,
  admissionEmail: true, phone: true, websiteUrl: true, facebookUrl: true,
  campusAddress: true, campusAddressKm: true, mapUrl: true, applicationUrl: true,
} satisfies Prisma.ProgrammePublicProfileSelect;

type FaqRow = Prisma.ProgrammeFaqGetPayload<{ select: typeof publicFaqSelect }>;
type ImportantDateRow = Prisma.ProgrammeImportantDateGetPayload<{ select: typeof publicImportantDateSelect }>;
type ProfileRow = Prisma.ProgrammePublicProfileGetPayload<{ select: typeof publicProfileSelect }>;
export type SearchablePublicProgrammeFaq = PublicProgrammeFaq & { keywords: string[] };

function localeOrEnglish(locale?: PublicProgrammeLocale): PublicProgrammeLocale {
  return locale === "km" ? "km" : "en";
}

export function translatedOrEnglish(khmer: string | null | undefined, english: string, locale?: PublicProgrammeLocale): string {
  const translated = khmer?.trim();
  return localeOrEnglish(locale) === "km" && translated ? translated : english;
}

function nullableTranslatedOrEnglish(khmer: string | null | undefined, english: string | null, locale?: PublicProgrammeLocale): string | null {
  const translated = khmer?.trim();
  return localeOrEnglish(locale) === "km" && translated ? translated : english;
}

async function assertActiveProgramme(programmeId: string): Promise<void> {
  const programme = await prisma.programme.findFirst({
    where: { id: programmeId, status: "active" }, select: { id: true },
  });
  if (!programme) throw new PublicProgrammeReadNotFoundError("Programme not found");
}

function faqDto(row: FaqRow, locale?: PublicProgrammeLocale): PublicProgrammeFaq {
  return {
    slug: row.slug,
    category: row.category,
    question: translatedOrEnglish(row.questionKm, row.question, locale),
    answer: translatedOrEnglish(row.answerKm, row.answer, locale),
    shortAnswer: nullableTranslatedOrEnglish(row.shortAnswerKm, row.shortAnswer, locale),
    isFeatured: row.isFeatured,
    sourceLabel: row.sourceLabel,
    sourceUrl: row.sourceUrl,
  };
}

function searchableFaqDto(row: FaqRow, locale?: PublicProgrammeLocale): SearchablePublicProgrammeFaq {
  const dto = faqDto(row, locale);
  return {
    ...dto,
    keywords: localeOrEnglish(locale) === "km" && row.keywordsKm.length ? row.keywordsKm : row.keywords,
  };
}

function dateDto(row: ImportantDateRow, locale?: PublicProgrammeLocale): PublicProgrammeImportantDate {
  return {
    kind: row.kind,
    title: translatedOrEnglish(row.titleKm, row.title, locale),
    description: translatedOrEnglish(row.descriptionKm, row.description, locale),
    date: row.date.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
  };
}

function profileDto(row: ProfileRow, locale?: PublicProgrammeLocale): PublicProgrammeProfile {
  return {
    programmeName: translatedOrEnglish(row.programmeNameKm, row.programmeName, locale),
    shortName: translatedOrEnglish(row.shortNameKm, row.shortName, locale),
    overview: translatedOrEnglish(row.overviewKm, row.overview, locale),
    admissionEmail: row.admissionEmail,
    phone: row.phone,
    websiteUrl: row.websiteUrl,
    facebookUrl: row.facebookUrl,
    campusAddress: nullableTranslatedOrEnglish(row.campusAddressKm, row.campusAddress, locale),
    mapUrl: row.mapUrl,
    applicationUrl: row.applicationUrl,
  };
}

async function profileOrNull(programmeId: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeProfile | null> {
  const row = await prisma.programmePublicProfile.findUnique({ where: { programmeId }, select: publicProfileSelect });
  return row ? profileDto(row, locale) : null;
}

export const publicProgrammeReadService = {
  async getProgramme(programmeId: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeProfile> {
    await assertActiveProgramme(programmeId);
    const profile = await profileOrNull(programmeId, locale);
    if (!profile) throw new PublicProgrammeReadNotFoundError("Public programme profile not found");
    return profile;
  },

  async listFaqs(programmeId: string, filters: PublicProgrammeFaqQuery = {}): Promise<PublicProgrammeFaq[]> {
    await assertActiveProgramme(programmeId);
    const rows = await prisma.programmeFaq.findMany({
      where: {
        programmeId,
        status: ProgrammePublicPublicationStatus.Published,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.featured === undefined ? {} : { isFeatured: filters.featured }),
      },
      select: publicFaqSelect,
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { question: "asc" }],
    });
    return rows.map((row) => faqDto(row, filters.locale));
  },

  async listFaqsForSearch(programmeId: string, locale?: PublicProgrammeLocale): Promise<SearchablePublicProgrammeFaq[]> {
    await assertActiveProgramme(programmeId);
    const rows = await prisma.programmeFaq.findMany({
      where: { programmeId, status: ProgrammePublicPublicationStatus.Published },
      select: publicFaqSelect,
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { question: "asc" }],
    });
    return rows.map((row) => searchableFaqDto(row, locale));
  },

  async getFaqBySlug(programmeId: string, slug: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeFaq> {
    await assertActiveProgramme(programmeId);
    const row = await prisma.programmeFaq.findFirst({
      where: { programmeId, slug, status: ProgrammePublicPublicationStatus.Published },
      select: publicFaqSelect,
    });
    if (!row) throw new PublicProgrammeReadNotFoundError("FAQ not found");
    return faqDto(row, locale);
  },

  async listFaqCategories(programmeId: string): Promise<PublicProgrammeFaqCategorySummary[]> {
    await assertActiveProgramme(programmeId);
    const grouped = await prisma.programmeFaq.groupBy({
      by: ["category"],
      where: { programmeId, status: ProgrammePublicPublicationStatus.Published },
      _count: { _all: true }, orderBy: { category: "asc" },
    });
    return grouped.map((item) => ({ category: item.category, count: item._count._all }));
  },

  async getAdmission(programmeId: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeAdmission> {
    const [faqs, profile] = await Promise.all([
      this.listFaqs(programmeId, { category: ProgrammeFaqCategory.Admission, locale }),
      profileOrNull(programmeId, locale),
    ]);
    return {
      applicationUrl: profile?.applicationUrl ?? null,
      admissionEmail: profile?.admissionEmail ?? null,
      phone: profile?.phone ?? null,
      faqs,
    };
  },

  async getFeesScholarships(programmeId: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeFeesScholarships> {
    return { faqs: await this.listFaqs(programmeId, { category: ProgrammeFaqCategory.FeesScholarships, locale }) };
  },

  async listImportantDates(programmeId: string, filters: PublicProgrammeImportantDateQuery = {}): Promise<PublicProgrammeImportantDate[]> {
    await assertActiveProgramme(programmeId);
    const rows = await prisma.programmeImportantDate.findMany({
      where: {
        programmeId,
        status: ProgrammePublicPublicationStatus.Published,
        ...(filters.kind ? { kind: filters.kind } : {}),
      },
      select: publicImportantDateSelect,
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    });
    return rows.map((row) => dateDto(row, filters.locale));
  },

  async getContact(programmeId: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeContact> {
    const profile = await this.getProgramme(programmeId, locale);
    return {
      admissionEmail: profile.admissionEmail,
      phone: profile.phone,
      websiteUrl: profile.websiteUrl,
      facebookUrl: profile.facebookUrl,
      campusAddress: profile.campusAddress,
      mapUrl: profile.mapUrl,
      applicationUrl: profile.applicationUrl,
    };
  },
};
''')

# Unicode-safe deterministic Ask DSE with locale-specific keywords.
write('apps/backend/src/plugins/programme/public-programme-search-service.ts', r'''import type { ProgrammeFaqCategory } from "@prisma/client";
import type { PublicProgrammeFaq, PublicProgrammeLocale } from "@dse-pms/shared-types";
import { publicProgrammeReadService, type SearchablePublicProgrammeFaq } from "./public-programme-read-service.ts";

export type PublicAskDseSuggestion = { faq: PublicProgrammeFaq; score: number };
export type PublicAskDseResult =
  | { kind: "answer"; faq: PublicProgrammeFaq; score: number }
  | { kind: "suggestions"; suggestions: PublicAskDseSuggestion[] }
  | { kind: "none" };

type RankableFaq = PublicProgrammeFaq & { keywords?: string[] };

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "before", "can", "do", "does", "for", "from",
  "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what",
  "when", "where", "which", "who", "will", "with", "you", "your",
]);
const SYNONYMS: Record<string, string> = {
  apply: "admission", application: "admission", applications: "admission", entry: "admission", enroll: "admission", enrol: "admission",
  tuition: "fees", cost: "fees", costs: "fees", price: "fees", prices: "fees", funding: "scholarship", scholarships: "scholarship",
  bursary: "scholarship", aid: "scholarship", coding: "programming", code: "programming", python: "programming", programmer: "programming",
  subjects: "course", subject: "course", modules: "course", module: "course", classes: "course", class: "course",
  jobs: "career", job: "career", employment: "career", careers: "career", professor: "lecturer", professors: "lecturer",
  teacher: "lecturer", teachers: "lecturer", instructor: "lecturer", instructors: "lecturer", labs: "facility", laboratory: "facility",
  laboratories: "facility", facilities: "facility", dates: "deadline", deadlines: "deadline",
};
const CATEGORY_TOKENS: Partial<Record<ProgrammeFaqCategory, string[]>> = {
  About: ["dse", "programme", "program"], Admission: ["admission", "requirement", "eligibility"],
  Curriculum: ["curriculum", "course", "programming"], Careers: ["career", "graduate", "work"],
  FeesScholarships: ["fees", "scholarship"], StudentLife: ["student", "life", "activity"], Facilities: ["facility", "lab"],
  Lecturers: ["lecturer", "staff"], ImportantDates: ["deadline", "date"], Contact: ["contact", "email", "phone"],
};

export function normalizePublicSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}
function canonicalToken(token: string): string {
  if (SYNONYMS[token]) return SYNONYMS[token]!;
  if (/^[a-z]+$/.test(token) && token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}
function tokens(value: string): string[] {
  const result = normalizePublicSearchText(value).split(" ").filter(Boolean).map(canonicalToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return [...new Set(result)];
}
function overlapCount(left: string[], right: Set<string>): number {
  return left.reduce((count, token) => count + (right.has(token) ? 1 : 0), 0);
}
function scoreFaq(question: string, faq: RankableFaq): number {
  const normalizedQuestion = normalizePublicSearchText(question);
  const normalizedFaqQuestion = normalizePublicSearchText(faq.question);
  if (!normalizedQuestion) return 0;
  if (normalizedQuestion === normalizedFaqQuestion) return 100;
  const queryTokens = tokens(question);
  if (!queryTokens.length) return 0;
  const questionTokens = new Set(tokens(faq.question));
  const answerTokens = new Set(tokens(`${faq.shortAnswer ?? ""} ${faq.answer}`));
  const keywordTokens = new Set(tokens((faq.keywords ?? []).join(" ")));
  const categoryTokens = new Set((CATEGORY_TOKENS[faq.category] ?? []).map(canonicalToken));
  const questionMatches = overlapCount(queryTokens, questionTokens);
  const answerMatches = overlapCount(queryTokens, answerTokens);
  const keywordMatches = overlapCount(queryTokens, keywordTokens);
  const categoryMatches = overlapCount(queryTokens, categoryTokens);
  const matched = queryTokens.filter((token) => questionTokens.has(token) || answerTokens.has(token) || keywordTokens.has(token) || categoryTokens.has(token)).length;
  const coverage = matched / queryTokens.length;
  const questionCoverage = questionMatches / queryTokens.length;
  let score = coverage * 60 + questionCoverage * 25;
  score += Math.min(answerMatches, 2) * 3;
  score += Math.min(keywordMatches, 2) * 5;
  score += Math.min(categoryMatches, 2) * 4;
  if (normalizedFaqQuestion.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedFaqQuestion)) score += 10;
  return Math.min(99, Math.round(score));
}
export function rankPublishedFaqs(question: string, faqs: RankableFaq[]): PublicAskDseSuggestion[] {
  return faqs.map((faq) => ({ faq, score: scoreFaq(question, faq) })).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.faq.question.localeCompare(b.faq.question));
}
export function chooseAskDseResult(question: string, faqs: RankableFaq[]): PublicAskDseResult {
  const ranked = rankPublishedFaqs(question, faqs);
  const first = ranked[0];
  if (!first || first.score < 35) return { kind: "none" };
  const second = ranked[1];
  const hasClearLead = !second || first.score - second.score >= 12;
  if (first.score >= 70 && hasClearLead) return { kind: "answer", faq: first.faq, score: first.score };
  const suggestions = ranked.filter((item) => item.score >= 35).slice(0, 3);
  return suggestions.length ? { kind: "suggestions", suggestions } : { kind: "none" };
}
export const publicProgrammeSearchService = {
  async search(programmeId: string, question: string, locale: PublicProgrammeLocale = "en"): Promise<PublicAskDseResult> {
    const faqs: SearchablePublicProgrammeFaq[] = await publicProgrammeReadService.listFaqsForSearch(programmeId, locale);
    return chooseAskDseResult(question, faqs);
  },
};
export type PublicProgrammeSearchService = typeof publicProgrammeSearchService;
''')

# Public API: locale query is optional and English remains default.
p = 'apps/backend/src/plugins/programme/public-programme-read-router.ts'
s = read(p)
s = rep(s, '''  PublicProgrammeFaqQuerySchema,\n  PublicProgrammeImportantDateQuerySchema,''', '''  PublicProgrammeFaqQuerySchema,\n  PublicProgrammeImportantDateQuerySchema,\n  PublicProgrammeLocaleQuerySchema,''', 'read router import')
s = rep(s, '''function programmeId(req: Request, res: Response): string | null {''', '''function localeFromQuery(req: Request, res: Response): \"en\" | \"km\" | null {\n  const parsed = PublicProgrammeLocaleQuerySchema.safeParse(req.query);\n  if (!parsed.success) {\n    res.status(400).json({ error: \"Invalid locale; expected en or km\" });\n    return null;\n  }\n  return parsed.data.locale ?? \"en\";\n}\n\nfunction programmeId(req: Request, res: Response): string | null {''', 'read router locale helper')
s = rep(s, '''      sendPublicJson(req, res, await publicProgrammeReadService.getProgramme(id));''', '''      const locale = localeFromQuery(req, res);\n      if (!locale) return;\n      sendPublicJson(req, res, await publicProgrammeReadService.getProgramme(id, locale));''', 'profile locale')
s = rep(s, '''      sendPublicJson(req, res, await publicProgrammeReadService.getFaqBySlug(id, slug));''', '''      const locale = localeFromQuery(req, res);\n      if (!locale) return;\n      sendPublicJson(req, res, await publicProgrammeReadService.getFaqBySlug(id, slug, locale));''', 'faq slug locale')
s = rep(s, '''      sendPublicJson(req, res, await publicProgrammeSearchService.search(id, question));''', '''      const locale = localeFromQuery(req, res);\n      if (!locale) return;\n      sendPublicJson(req, res, await publicProgrammeSearchService.search(id, question, locale));''', 'search locale')
s = rep(s, '''      sendPublicJson(req, res, await publicProgrammeReadService.getAdmission(id));''', '''      const locale = localeFromQuery(req, res);\n      if (!locale) return;\n      sendPublicJson(req, res, await publicProgrammeReadService.getAdmission(id, locale));''', 'admission locale')
s = rep(s, '''      sendPublicJson(req, res, await publicProgrammeReadService.getFeesScholarships(id));''', '''      const locale = localeFromQuery(req, res);\n      if (!locale) return;\n      sendPublicJson(req, res, await publicProgrammeReadService.getFeesScholarships(id, locale));''', 'fees locale')
s = rep(s, '''      sendPublicJson(req, res, await publicProgrammeReadService.getContact(id));''', '''      const locale = localeFromQuery(req, res);\n      if (!locale) return;\n      sendPublicJson(req, res, await publicProgrammeReadService.getContact(id, locale));''', 'contact locale')
write(p, s)

# Telegram router receives a locale resolver but remains owner of routing/security.
p = 'apps/backend/src/plugins/telegram/public-bot/router.ts'
s = read(p)
s = rep(s, '''  PublicProgrammeImportantDate,\n  PublicProgrammeProfile,''', '''  PublicProgrammeImportantDate,\n  PublicProgrammeLocale,\n  PublicProgrammeProfile,''', 'telegram locale import')
s = rep(s, '''  getProgramme(programmeId: string): Promise<PublicProgrammeProfile>;\n  listFaqs(programmeId: string, filters?: { category?: ProgrammeFaqCategory; featured?: boolean }): Promise<PublicProgrammeFaq[]>;\n  getAdmission(programmeId: string): Promise<PublicProgrammeAdmission>;\n  getFeesScholarships(programmeId: string): Promise<PublicProgrammeFeesScholarships>;\n  listImportantDates(programmeId: string): Promise<PublicProgrammeImportantDate[]>;\n  getContact(programmeId: string): Promise<PublicProgrammeContact>;''', '''  getProgramme(programmeId: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeProfile>;\n  listFaqs(programmeId: string, filters?: { category?: ProgrammeFaqCategory; featured?: boolean; locale?: PublicProgrammeLocale }): Promise<PublicProgrammeFaq[]>;\n  getAdmission(programmeId: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeAdmission>;\n  getFeesScholarships(programmeId: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeFeesScholarships>;\n  listImportantDates(programmeId: string, filters?: { locale?: PublicProgrammeLocale }): Promise<PublicProgrammeImportantDate[]>;\n  getContact(programmeId: string, locale?: PublicProgrammeLocale): Promise<PublicProgrammeContact>;''', 'telegram read type')
s = rep(s, '''  now?: () => number;\n}''', '''  now?: () => number;\n  localeForChat?: (chatId: number) => PublicProgrammeLocale;\n}''', 'telegram deps locale')
s = rep(s, '''async function renderRoute(\n  route: RouteKey,\n  programmeId: string,\n  publicRead: PublicReadService,\n):''', '''async function renderRoute(\n  route: RouteKey,\n  programmeId: string,\n  publicRead: PublicReadService,\n  locale: PublicProgrammeLocale = \"en\",\n):''', 'renderRoute locale')
s = s.replace('publicRead.getAdmission(programmeId)', 'publicRead.getAdmission(programmeId, locale)')
s = s.replace('publicRead.getFeesScholarships(programmeId)', 'publicRead.getFeesScholarships(programmeId, locale)')
s = s.replace('publicRead.listImportantDates(programmeId)', 'publicRead.listImportantDates(programmeId, { locale })')
s = s.replace('publicRead.getContact(programmeId)', 'publicRead.getContact(programmeId, locale)')
s = s.replace('publicRead.listFaqs(programmeId, { featured: true })', 'publicRead.listFaqs(programmeId, { featured: true, locale })')
s = s.replace('publicRead.listFaqs(programmeId, { category })', 'publicRead.listFaqs(programmeId, { category, locale })')
s = rep(s, '''async function renderStaticCallback(\n  data: string,\n  programmeId: string,\n  publicRead: PublicReadService,\n):''', '''async function renderStaticCallback(\n  data: string,\n  programmeId: string,\n  publicRead: PublicReadService,\n  locale: PublicProgrammeLocale = \"en\",\n):''', 'render callback locale')
s = s.replace('return renderRoute(route, programmeId, publicRead);', 'return renderRoute(route, programmeId, publicRead, locale);')
s = s.replace('return renderRoute(routeKey, programmeId, publicRead);', 'return renderRoute(routeKey, programmeId, publicRead, locale);')
s = s.replace('return renderRoute("fit", programmeId, publicRead);', 'return renderRoute("fit", programmeId, publicRead, locale);')
s = s.replace('return renderRoute("home", programmeId, publicRead);', 'return renderRoute("home", programmeId, publicRead, locale);')
# Specific explicit-category calls created before generic replacements.
s = s.replace('publicRead.listFaqs(programmeId, { category: explicitCategory })', 'publicRead.listFaqs(programmeId, { category: explicitCategory, locale })')
s = s.replace('publicRead.listFaqs(programmeId, { category: "Curriculum" })', 'publicRead.listFaqs(programmeId, { category: "Curriculum", locale })')
s = s.replace('publicRead.listFaqs(programmeId, { category: "Lecturers" })', 'publicRead.listFaqs(programmeId, { category: "Lecturers", locale })')
s = rep(s, '''    const programmeId = config.publicProgrammeId;\n\n    try {''', '''    const programmeId = config.publicProgrammeId;\n    const locale = actorId === undefined ? \"en\" : (deps.localeForChat?.(actorId) ?? \"en\");\n\n    try {''', 'telegram request locale')
s = s.replace('renderRoute("ask", programmeId, publicRead)', 'renderRoute("ask", programmeId, publicRead, locale)')
s = s.replace('renderRoute(route, programmeId, publicRead)', 'renderRoute(route, programmeId, publicRead, locale)')
s = s.replace('publicSearch.search(programmeId, text)', 'publicSearch.search(programmeId, text, locale)')
s = s.replace('renderStaticCallback(parsedCallback.data, programmeId, publicRead)', 'renderStaticCallback(parsedCallback.data, programmeId, publicRead, locale)')
write(p, s)

# Locale adapter exposes its safe HMAC-keyed selection to the underlying router.
p = 'apps/backend/src/plugins/telegram/public-bot/localized-router.ts'
s = read(p)
s = rep(s, '''function localeKey(webhookSecret: string, chatId: number): string {\n  return purposeHmac(webhookSecret, \"telegram-public-locale:v1\", chatId);\n}\n''', '''function localeKey(webhookSecret: string, chatId: number): string {\n  return purposeHmac(webhookSecret, \"telegram-public-locale:v1\", chatId);\n}\n\nfunction localeForChat(webhookSecret: string, chatId: number): TelegramLocale {\n  return localeStore.get(localeKey(webhookSecret, chatId)) ?? \"en\";\n}\n''', 'locale resolver')
s = rep(s, '''    client: localizedClient(baseClient, config.webhookSecret),\n  }));''', '''    client: localizedClient(baseClient, config.webhookSecret),\n    localeForChat: deps.localeForChat ?? ((chatId) => localeForChat(config.webhookSecret!, chatId)),\n  }));''', 'pass locale resolver')
write(p, s)

# Frontend admin bilingual fields.
p = 'apps/frontend/app/(shell)/public-information/public-information-client.tsx'
s = read(p)
s = rep(s, '''  shortAnswer: string;\n  keywords: string;\n  sortOrder:''', '''  shortAnswer: string;\n  keywords: string;\n  questionKm: string;\n  answerKm: string;\n  shortAnswerKm: string;\n  keywordsKm: string;\n  sortOrder:''', 'frontend faq draft fields')
s = rep(s, '''  title: string;\n  description: string;\n  date:''', '''  title: string;\n  description: string;\n  titleKm: string;\n  descriptionKm: string;\n  date:''', 'frontend date draft fields')
s = rep(s, '''    shortAnswer: \"\",\n    keywords: \"\",\n    sortOrder:''', '''    shortAnswer: \"\",\n    keywords: \"\",\n    questionKm: \"\",\n    answerKm: \"\",\n    shortAnswerKm: \"\",\n    keywordsKm: \"\",\n    sortOrder:''', 'blank faq km')
s = rep(s, '''    shortAnswer: faq.shortAnswer ?? \"\",\n    keywords: faq.keywords.join(\", \"),\n    sortOrder:''', '''    shortAnswer: faq.shortAnswer ?? \"\",\n    keywords: faq.keywords.join(\", \"),\n    questionKm: faq.questionKm ?? \"\",\n    answerKm: faq.answerKm ?? \"\",\n    shortAnswerKm: faq.shortAnswerKm ?? \"\",\n    keywordsKm: faq.keywordsKm.join(\", \"),\n    sortOrder:''', 'faq draft km')
s = rep(s, '''    keywords: draft.keywords\n      .split(\",\")\n      .map((item) => item.trim())\n      .filter(Boolean),\n    sortOrder:''', '''    keywords: draft.keywords\n      .split(\",\")\n      .map((item) => item.trim())\n      .filter(Boolean),\n    questionKm: draft.questionKm.trim() || null,\n    answerKm: draft.answerKm.trim() || null,\n    shortAnswerKm: draft.shortAnswerKm.trim() || null,\n    keywordsKm: draft.keywordsKm.split(\",\").map((item) => item.trim()).filter(Boolean),\n    sortOrder:''', 'faq payload km')
s = rep(s, '''    title: \"\",\n    description: \"\",\n    date:''', '''    title: \"\",\n    description: \"\",\n    titleKm: \"\",\n    descriptionKm: \"\",\n    date:''', 'blank date km')
s = rep(s, '''    title: item.title,\n    description: item.description,\n    date:''', '''    title: item.title,\n    description: item.description,\n    titleKm: item.titleKm ?? \"\",\n    descriptionKm: item.descriptionKm ?? \"\",\n    date:''', 'date draft km')
s = rep(s, '''    title: draft.title.trim(),\n    description: draft.description.trim(),\n    date:''', '''    title: draft.title.trim(),\n    description: draft.description.trim(),\n    titleKm: draft.titleKm.trim() || null,\n    descriptionKm: draft.descriptionKm.trim() || null,\n    date:''', 'date payload km')
s = rep(s, '''    overview: \"\",\n    admissionEmail:''', '''    overview: \"\",\n    programmeNameKm: null,\n    shortNameKm: null,\n    overviewKm: null,\n    admissionEmail:''', 'blank profile km')
s = rep(s, '''    campusAddress: null,\n    mapUrl:''', '''    campusAddress: null,\n    campusAddressKm: null,\n    mapUrl:''', 'blank profile address km')
s = rep(s, '''    overview: profile.overview,\n    admissionEmail:''', '''    overview: profile.overview,\n    programmeNameKm: profile.programmeNameKm,\n    shortNameKm: profile.shortNameKm,\n    overviewKm: profile.overviewKm,\n    admissionEmail:''', 'profile draft km')
s = rep(s, '''    campusAddress: profile.campusAddress,\n    mapUrl:''', '''    campusAddress: profile.campusAddress,\n    campusAddressKm: profile.campusAddressKm,\n    mapUrl:''', 'profile draft address km')
# Replace editors with clearer bilingual sections.
start = s.index('function FaqEditor(')
end = s.index('\nfunction ImportantDatesPanel(', start)
faq_editor = r'''function FaqEditor({ draft, setDraft }: { draft: FaqDraft; setDraft: React.Dispatch<React.SetStateAction<FaqDraft>> }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="faq-category">Category</Label><select id="faq-category" value={draft.category} onChange={(e) => setDraft((v) => ({ ...v, category: e.target.value as ProgrammeFaqCategory }))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{ProgrammeFaqCategorySchema.options.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="faq-slug">Slug</Label><Input id="faq-slug" value={draft.slug} onChange={(e) => setDraft((v) => ({ ...v, slug: e.target.value }))} placeholder="admission-programming-experience" /></div>
      </div>
      <fieldset className="space-y-3 rounded-lg border border-border p-4"><legend className="px-1 text-sm font-semibold">English (required)</legend>
        <div className="space-y-2"><Label htmlFor="faq-question">Question</Label><Input id="faq-question" value={draft.question} onChange={(e) => setDraft((v) => ({ ...v, question: e.target.value }))} /></div>
        <div className="space-y-2"><Label htmlFor="faq-answer">Answer</Label><textarea id="faq-answer" value={draft.answer} onChange={(e) => setDraft((v) => ({ ...v, answer: e.target.value }))} className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <div className="space-y-2"><Label htmlFor="faq-short">Short answer (optional)</Label><textarea id="faq-short" value={draft.shortAnswer} onChange={(e) => setDraft((v) => ({ ...v, shortAnswer: e.target.value }))} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <div className="space-y-2"><Label htmlFor="faq-keywords">Keywords (comma-separated)</Label><Input id="faq-keywords" value={draft.keywords} onChange={(e) => setDraft((v) => ({ ...v, keywords: e.target.value }))} placeholder="python, programming, beginner" /></div>
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border border-border p-4"><legend className="px-1 text-sm font-semibold">ខ្មែរ / Khmer (optional · falls back to English)</legend>
        <div className="space-y-2"><Label htmlFor="faq-question-km">សំណួរ / Question (Khmer)</Label><Input id="faq-question-km" lang="km" value={draft.questionKm} onChange={(e) => setDraft((v) => ({ ...v, questionKm: e.target.value }))} /></div>
        <div className="space-y-2"><Label htmlFor="faq-answer-km">ចម្លើយ / Answer (Khmer)</Label><textarea id="faq-answer-km" lang="km" value={draft.answerKm} onChange={(e) => setDraft((v) => ({ ...v, answerKm: e.target.value }))} className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <div className="space-y-2"><Label htmlFor="faq-short-km">ចម្លើយខ្លី / Short answer (Khmer)</Label><textarea id="faq-short-km" lang="km" value={draft.shortAnswerKm} onChange={(e) => setDraft((v) => ({ ...v, shortAnswerKm: e.target.value }))} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <div className="space-y-2"><Label htmlFor="faq-keywords-km">ពាក្យគន្លឹះ / Keywords (Khmer, comma-separated)</Label><Input id="faq-keywords-km" lang="km" value={draft.keywordsKm} onChange={(e) => setDraft((v) => ({ ...v, keywordsKm: e.target.value }))} /></div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="faq-order">Sort order</Label><Input id="faq-order" type="number" min="0" value={draft.sortOrder} onChange={(e) => setDraft((v) => ({ ...v, sortOrder: e.target.value }))} /></div><div className="flex items-end"><label className="flex items-center gap-2 pb-2 text-sm text-foreground"><input type="checkbox" checked={draft.isFeatured} onChange={(e) => setDraft((v) => ({ ...v, isFeatured: e.target.checked }))} />Feature this FAQ</label></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="faq-source-label">Source label</Label><Input id="faq-source-label" value={draft.sourceLabel} onChange={(e) => setDraft((v) => ({ ...v, sourceLabel: e.target.value }))} /></div><div className="space-y-2"><Label htmlFor="faq-source-url">Source URL</Label><Input id="faq-source-url" type="url" value={draft.sourceUrl} onChange={(e) => setDraft((v) => ({ ...v, sourceUrl: e.target.value }))} /></div></div>
      <div className="space-y-2"><Label htmlFor="faq-reviewed">Reviewed date</Label><Input id="faq-reviewed" type="date" value={draft.reviewedAt} onChange={(e) => setDraft((v) => ({ ...v, reviewedAt: e.target.value }))} className="sm:max-w-56" /></div>
    </div>
  );
}
'''
s = s[:start] + faq_editor + s[end:]
start = s.index('function ImportantDateEditor(')
end = s.index('\nfunction ProfilePanel(', start)
date_editor = r'''function ImportantDateEditor({ draft, setDraft }: { draft: ImportantDateDraft; setDraft: React.Dispatch<React.SetStateAction<ImportantDateDraft>> }) {
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="date-kind">Type</Label><select id="date-kind" value={draft.kind} onChange={(e) => setDraft((v) => ({ ...v, kind: e.target.value as ProgrammeImportantDateKind }))} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">{ProgrammeImportantDateKindSchema.options.map((kind) => <option key={kind} value={kind}>{dateKindLabels[kind]}</option>)}</select></div><div className="space-y-2"><Label htmlFor="date-title">Title (English)</Label><Input id="date-title" value={draft.title} onChange={(e) => setDraft((v) => ({ ...v, title: e.target.value }))} /></div></div>
    <div className="space-y-2"><Label htmlFor="date-description">Description (English)</Label><textarea id="date-description" value={draft.description} onChange={(e) => setDraft((v) => ({ ...v, description: e.target.value }))} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="date-title-km">ចំណងជើង / Title (Khmer)</Label><Input id="date-title-km" lang="km" value={draft.titleKm} onChange={(e) => setDraft((v) => ({ ...v, titleKm: e.target.value }))} /></div><div className="space-y-2"><Label htmlFor="date-description-km">ការពិពណ៌នា / Description (Khmer)</Label><textarea id="date-description-km" lang="km" value={draft.descriptionKm} onChange={(e) => setDraft((v) => ({ ...v, descriptionKm: e.target.value }))} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div></div>
    <div className="grid gap-4 sm:grid-cols-3"><div className="space-y-2"><Label htmlFor="date-start">Date</Label><Input id="date-start" type="date" value={draft.date} onChange={(e) => setDraft((v) => ({ ...v, date: e.target.value }))} /></div><div className="space-y-2"><Label htmlFor="date-end">End date</Label><Input id="date-end" type="date" value={draft.endDate} onChange={(e) => setDraft((v) => ({ ...v, endDate: e.target.value }))} /></div><div className="space-y-2"><Label htmlFor="date-order">Sort order</Label><Input id="date-order" type="number" min="0" value={draft.sortOrder} onChange={(e) => setDraft((v) => ({ ...v, sortOrder: e.target.value }))} /></div></div>
  </div>;
}
'''
s = s[:start] + date_editor + s[end:]
# Profile bilingual fields via exact insertion into compact markup.
s = rep(s, '''</div><div className=\"space-y-2\"><Label htmlFor=\"profile-overview\">Public overview</Label><textarea id=\"profile-overview\"''', '''</div><div className=\"space-y-2\"><Label htmlFor=\"profile-overview\">Public overview (English)</Label><textarea id=\"profile-overview\"''', 'profile english label')
s = rep(s, '''className=\"min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm\" /></div><div className=\"grid gap-4 sm:grid-cols-2\"><Field label=\"Admissions email\"''', '''className=\"min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm\" /></div><div className=\"rounded-lg border border-border p-4\"><p className=\"mb-3 text-sm font-semibold\">ខ្មែរ / Khmer (optional · falls back to English)</p><div className=\"grid gap-4 sm:grid-cols-2\"><Field label=\"ឈ្មោះកម្មវិធី / Programme name\" id=\"profile-name-km\" value={text(\"programmeNameKm\")} onChange={(v) => set(\"programmeNameKm\", v)} disabled={!canWrite} /><Field label=\"ឈ្មោះខ្លី / Short name\" id=\"profile-short-km\" value={text(\"shortNameKm\")} onChange={(v) => set(\"shortNameKm\", v)} disabled={!canWrite} /></div><div className=\"mt-4 space-y-2\"><Label htmlFor=\"profile-overview-km\">សេចក្ដីណែនាំ / Public overview</Label><textarea id=\"profile-overview-km\" lang=\"km\" value={text(\"overviewKm\")} onChange={(e) => set(\"overviewKm\", e.target.value)} disabled={!canWrite} className=\"min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm\" /></div><div className=\"mt-4 space-y-2\"><Label htmlFor=\"profile-address-km\">អាសយដ្ឋាន / Campus address</Label><textarea id=\"profile-address-km\" lang=\"km\" value={text(\"campusAddressKm\")} onChange={(e) => set(\"campusAddressKm\", e.target.value)} disabled={!canWrite} className=\"min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm\" /></div></div><div className=\"grid gap-4 sm:grid-cols-2\"><Field label=\"Admissions email\"''', 'profile khmer section')
write(p, s)

# Focused deterministic Khmer tests + fallback helper tests.
write('apps/backend/src/plugins/programme/public-programme-bilingual.test.ts', r'''import { describe, expect, test } from "bun:test";
import type { PublicProgrammeFaq } from "@dse-pms/shared-types";
import { chooseAskDseResult, normalizePublicSearchText } from "./public-programme-search-service.ts";
import { translatedOrEnglish } from "./public-programme-read-service.ts";

const khmerFaq: PublicProgrammeFaq & { keywords?: string[] } = {
  slug: "admission-requirements",
  category: "Admission",
  question: "តើលក្ខខណ្ឌចូលរៀនមានអ្វីខ្លះ?",
  answer: "បេក្ខជនត្រូវបំពេញលក្ខខណ្ឌចូលរៀនរបស់កម្មវិធី DSE។",
  shortAnswer: "សូមពិនិត្យលក្ខខណ្ឌចូលរៀន DSE។",
  keywords: ["ចូលរៀន", "លក្ខខណ្ឌ", "បេក្ខជន"],
  isFeatured: true,
  sourceLabel: null,
  sourceUrl: null,
};

describe("bilingual public programme content", () => {
  test("keeps Khmer letters during deterministic normalization", () => {
    expect(normalizePublicSearchText("តើ ចូលរៀន DSE ដូចម្តេច?" )).toContain("ចូលរៀន");
  });

  test("returns a strong Khmer Ask DSE answer", () => {
    const result = chooseAskDseResult("តើលក្ខខណ្ឌចូលរៀនមានអ្វីខ្លះ?", [khmerFaq]);
    expect(result.kind).toBe("answer");
  });

  test("uses Khmer keywords for a deterministic match", () => {
    const result = chooseAskDseResult("បេក្ខជន ចូលរៀន", [khmerFaq]);
    expect(result.kind).not.toBe("none");
  });

  test("returns none for unrelated Khmer text", () => {
    expect(chooseAskDseResult("អាកាសធាតុថ្ងៃនេះ", [khmerFaq]).kind).toBe("none");
  });

  test("falls back to English when Khmer translation is missing", () => {
    expect(translatedOrEnglish(null, "English fallback", "km")).toBe("English fallback");
    expect(translatedOrEnglish("  ខ្មែរ  ", "English fallback", "km")).toBe("ខ្មែរ");
    expect(translatedOrEnglish("ខ្មែរ", "English fallback", "en")).toBe("English fallback");
  });
});
''')

# Self-clean so only product changes remain in the PR diff.
(ROOT / '.github/workflows/issue-545-apply.yml').unlink(missing_ok=True)
Path(__file__).unlink(missing_ok=True)
