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
  isFeatured: true,
  sourceLabel: true,
  sourceUrl: true,
} satisfies Prisma.ProgrammeFaqSelect;

const publicImportantDateSelect = {
  kind: true,
  title: true,
  description: true,
  date: true,
  endDate: true,
} satisfies Prisma.ProgrammeImportantDateSelect;

const publicProfileSelect = {
  programmeName: true,
  shortName: true,
  overview: true,
  admissionEmail: true,
  phone: true,
  websiteUrl: true,
  facebookUrl: true,
  campusAddress: true,
  mapUrl: true,
  applicationUrl: true,
} satisfies Prisma.ProgrammePublicProfileSelect;

async function assertActiveProgramme(programmeId: string): Promise<void> {
  const programme = await prisma.programme.findFirst({
    where: { id: programmeId, status: "active" },
    select: { id: true },
  });
  if (!programme) throw new PublicProgrammeReadNotFoundError("Programme not found");
}

function faqDto(row: Prisma.ProgrammeFaqGetPayload<{ select: typeof publicFaqSelect }>): PublicProgrammeFaq {
  return row;
}

function dateDto(
  row: Prisma.ProgrammeImportantDateGetPayload<{ select: typeof publicImportantDateSelect }>,
): PublicProgrammeImportantDate {
  return {
    ...row,
    date: row.date.toISOString().slice(0, 10),
    endDate: row.endDate ? row.endDate.toISOString().slice(0, 10) : null,
  };
}

async function profileOrNull(programmeId: string): Promise<PublicProgrammeProfile | null> {
  return prisma.programmePublicProfile.findUnique({
    where: { programmeId },
    select: publicProfileSelect,
  });
}

export const publicProgrammeReadService = {
  async getProgramme(programmeId: string): Promise<PublicProgrammeProfile> {
    await assertActiveProgramme(programmeId);
    const profile = await profileOrNull(programmeId);
    if (!profile) throw new PublicProgrammeReadNotFoundError("Public programme profile not found");
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
        ...(filters.featured === undefined ? {} : { isFeatured: filters.featured }),
      },
      select: publicFaqSelect,
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { question: "asc" }],
    });
    return rows.map(faqDto);
  },

  async getFaqBySlug(programmeId: string, slug: string): Promise<PublicProgrammeFaq> {
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
    return faqDto(row);
  },

  async listFaqCategories(programmeId: string): Promise<PublicProgrammeFaqCategorySummary[]> {
    await assertActiveProgramme(programmeId);
    const grouped = await prisma.programmeFaq.groupBy({
      by: ["category"],
      where: { programmeId, status: ProgrammePublicPublicationStatus.Published },
      _count: { _all: true },
      orderBy: { category: "asc" },
    });
    return grouped.map((item) => ({ category: item.category, count: item._count._all }));
  },

  async getAdmission(programmeId: string): Promise<PublicProgrammeAdmission> {
    const [faqs, profile] = await Promise.all([
      this.listFaqs(programmeId, { category: ProgrammeFaqCategory.Admission }),
      profileOrNull(programmeId),
    ]);
    return {
      applicationUrl: profile?.applicationUrl ?? null,
      admissionEmail: profile?.admissionEmail ?? null,
      phone: profile?.phone ?? null,
      faqs,
    };
  },

  async getFeesScholarships(programmeId: string): Promise<PublicProgrammeFeesScholarships> {
    return {
      faqs: await this.listFaqs(programmeId, {
        category: ProgrammeFaqCategory.FeesScholarships,
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
    return rows.map(dateDto);
  },

  async getContact(programmeId: string): Promise<PublicProgrammeContact> {
    const profile = await this.getProgramme(programmeId);
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
