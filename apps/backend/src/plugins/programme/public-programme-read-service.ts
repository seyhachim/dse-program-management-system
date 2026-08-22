import {
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
  slug: true,
  category: true,
  question: true,
  answer: true,
  shortAnswer: true,
  keywords: true,
  questionKm: true,
  answerKm: true,
  shortAnswerKm: true,
  keywordsKm: true,
  isFeatured: true,
  sourceLabel: true,
  sourceUrl: true,
} satisfies Prisma.ProgrammeFaqSelect;

const publicImportantDateSelect = {
  kind: true,
  title: true,
  description: true,
  titleKm: true,
  descriptionKm: true,
  date: true,
  endDate: true,
} satisfies Prisma.ProgrammeImportantDateSelect;

const publicProfileSelect = {
  programmeName: true,
  shortName: true,
  overview: true,
  programmeNameKm: true,
  shortNameKm: true,
  overviewKm: true,
  admissionEmail: true,
  phone: true,
  websiteUrl: true,
  facebookUrl: true,
  campusAddress: true,
  campusAddressKm: true,
  mapUrl: true,
  applicationUrl: true,
} satisfies Prisma.ProgrammePublicProfileSelect;

type FaqRow = Prisma.ProgrammeFaqGetPayload<{ select: typeof publicFaqSelect }>;
type ImportantDateRow = Prisma.ProgrammeImportantDateGetPayload<{
  select: typeof publicImportantDateSelect;
}>;
type ProfileRow = Prisma.ProgrammePublicProfileGetPayload<{
  select: typeof publicProfileSelect;
}>;
export type SearchablePublicProgrammeFaq = PublicProgrammeFaq & {
  keywords: string[];
};

function localeOrEnglish(
  locale?: PublicProgrammeLocale,
): PublicProgrammeLocale {
  return locale === "km" ? "km" : "en";
}

export function translatedOrEnglish(
  khmer: string | null | undefined,
  english: string,
  locale?: PublicProgrammeLocale,
): string {
  const translated = khmer?.trim();
  return localeOrEnglish(locale) === "km" && translated ? translated : english;
}

function nullableTranslatedOrEnglish(
  khmer: string | null | undefined,
  english: string | null,
  locale?: PublicProgrammeLocale,
): string | null {
  const translated = khmer?.trim();
  return localeOrEnglish(locale) === "km" && translated ? translated : english;
}

async function assertActiveProgramme(programmeId: string): Promise<void> {
  const programme = await prisma.programme.findFirst({
    where: { id: programmeId, status: "active" },
    select: { id: true },
  });
  if (!programme)
    throw new PublicProgrammeReadNotFoundError("Programme not found");
}

function faqDto(
  row: FaqRow,
  locale?: PublicProgrammeLocale,
): PublicProgrammeFaq {
  return {
    slug: row.slug,
    category: row.category,
    question: translatedOrEnglish(row.questionKm, row.question, locale),
    answer: translatedOrEnglish(row.answerKm, row.answer, locale),
    shortAnswer: nullableTranslatedOrEnglish(
      row.shortAnswerKm,
      row.shortAnswer,
      locale,
    ),
    isFeatured: row.isFeatured,
    sourceLabel: row.sourceLabel,
    sourceUrl: row.sourceUrl,
  };
}

function searchableFaqDto(
  row: FaqRow,
  locale?: PublicProgrammeLocale,
): SearchablePublicProgrammeFaq {
  const dto = faqDto(row, locale);
  return {
    ...dto,
    keywords:
      localeOrEnglish(locale) === "km" && row.keywordsKm.length
        ? row.keywordsKm
        : row.keywords,
  };
}

function dateDto(
  row: ImportantDateRow,
  locale?: PublicProgrammeLocale,
): PublicProgrammeImportantDate {
  return {
    kind: row.kind,
    title: translatedOrEnglish(row.titleKm, row.title, locale),
    description: translatedOrEnglish(
      row.descriptionKm,
      row.description,
      locale,
    ),
    date: row.date.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
  };
}

function profileDto(
  row: ProfileRow,
  locale?: PublicProgrammeLocale,
): PublicProgrammeProfile {
  return {
    programmeName: translatedOrEnglish(
      row.programmeNameKm,
      row.programmeName,
      locale,
    ),
    shortName: translatedOrEnglish(row.shortNameKm, row.shortName, locale),
    overview: translatedOrEnglish(row.overviewKm, row.overview, locale),
    admissionEmail: row.admissionEmail,
    phone: row.phone,
    websiteUrl: row.websiteUrl,
    facebookUrl: row.facebookUrl,
    campusAddress: nullableTranslatedOrEnglish(
      row.campusAddressKm,
      row.campusAddress,
      locale,
    ),
    mapUrl: row.mapUrl,
    applicationUrl: row.applicationUrl,
  };
}

async function profileOrNull(
  programmeId: string,
  locale?: PublicProgrammeLocale,
): Promise<PublicProgrammeProfile | null> {
  const row = await prisma.programmePublicProfile.findUnique({
    where: { programmeId },
    select: publicProfileSelect,
  });
  return row ? profileDto(row, locale) : null;
}

export const publicProgrammeReadService = {
  async getProgramme(
    programmeId: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeProfile> {
    await assertActiveProgramme(programmeId);
    const profile = await profileOrNull(programmeId, locale);
    if (!profile)
      throw new PublicProgrammeReadNotFoundError(
        "Public programme profile not found",
      );
    return profile;
  },

  async listFaqs(
    programmeId: string,
    filters: PublicProgrammeFaqQuery = {},
  ): Promise<PublicProgrammeFaq[]> {
    await assertActiveProgramme(programmeId);
    const rows = await prisma.programmeFaq.findMany({
      where: {
        programmeId,
        status: ProgrammePublicPublicationStatus.Published,
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.featured === undefined
          ? {}
          : { isFeatured: filters.featured }),
      },
      select: publicFaqSelect,
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { question: "asc" }],
    });
    return rows.map((row) => faqDto(row, filters.locale));
  },

  async listFaqsForSearch(
    programmeId: string,
    locale?: PublicProgrammeLocale,
  ): Promise<SearchablePublicProgrammeFaq[]> {
    await assertActiveProgramme(programmeId);
    const rows = await prisma.programmeFaq.findMany({
      where: {
        programmeId,
        status: ProgrammePublicPublicationStatus.Published,
      },
      select: publicFaqSelect,
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { question: "asc" }],
    });
    return rows.map((row) => searchableFaqDto(row, locale));
  },

  async getFaqBySlug(
    programmeId: string,
    slug: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeFaq> {
    await assertActiveProgramme(programmeId);
    const row = await prisma.programmeFaq.findFirst({
      where: {
        programmeId,
        slug,
        status: ProgrammePublicPublicationStatus.Published,
      },
      select: publicFaqSelect,
    });
    if (!row) throw new PublicProgrammeReadNotFoundError("FAQ not found");
    return faqDto(row, locale);
  },

  async listFaqCategories(
    programmeId: string,
  ): Promise<PublicProgrammeFaqCategorySummary[]> {
    await assertActiveProgramme(programmeId);
    const grouped = await prisma.programmeFaq.groupBy({
      by: ["category"],
      where: {
        programmeId,
        status: ProgrammePublicPublicationStatus.Published,
      },
      _count: { _all: true },
      orderBy: { category: "asc" },
    });
    return grouped.map((item) => ({
      category: item.category,
      count: item._count._all,
    }));
  },

  async getAdmission(
    programmeId: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeAdmission> {
    const [faqs, profile] = await Promise.all([
      this.listFaqs(programmeId, {
        category: ProgrammeFaqCategory.Admission,
        locale,
      }),
      profileOrNull(programmeId, locale),
    ]);
    return {
      applicationUrl: profile?.applicationUrl ?? null,
      admissionEmail: profile?.admissionEmail ?? null,
      phone: profile?.phone ?? null,
      faqs,
    };
  },

  async getFeesScholarships(
    programmeId: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeFeesScholarships> {
    return {
      faqs: await this.listFaqs(programmeId, {
        category: ProgrammeFaqCategory.FeesScholarships,
        locale,
      }),
    };
  },

  async listImportantDates(
    programmeId: string,
    filters: PublicProgrammeImportantDateQuery = {},
  ): Promise<PublicProgrammeImportantDate[]> {
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

  async getContact(
    programmeId: string,
    locale?: PublicProgrammeLocale,
  ): Promise<PublicProgrammeContact> {
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
