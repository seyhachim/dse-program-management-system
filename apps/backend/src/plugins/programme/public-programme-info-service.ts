import { ProgrammePublicPublicationStatus } from "@prisma/client";
import type {
  ProgrammeFaqAdminWrite,
  ProgrammeImportantDateAdminWrite,
  ProgrammePublicProfileAdminWrite,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";

export class PublicProgrammeInfoNotFoundError extends Error {}
export class PublicProgrammeInfoConflictError extends Error {}

function nullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function faqData(input: ProgrammeFaqAdminWrite) {
  return {
    category: input.category,
    slug: input.slug,
    question: input.question,
    answer: input.answer,
    shortAnswer: nullable(input.shortAnswer),
    keywords: input.keywords,
    sortOrder: input.sortOrder,
    isFeatured: input.isFeatured,
    sourceLabel: nullable(input.sourceLabel),
    sourceUrl: nullable(input.sourceUrl),
    reviewedAt: input.reviewedAt ?? null,
  };
}

function importantDateData(input: ProgrammeImportantDateAdminWrite) {
  return {
    kind: input.kind,
    title: input.title,
    description: input.description,
    date: input.date,
    endDate: input.endDate ?? null,
    sortOrder: input.sortOrder,
  };
}

function profileData(input: ProgrammePublicProfileAdminWrite) {
  return {
    programmeName: input.programmeName,
    shortName: input.shortName,
    overview: input.overview,
    admissionEmail: nullable(input.admissionEmail),
    phone: nullable(input.phone),
    websiteUrl: nullable(input.websiteUrl),
    facebookUrl: nullable(input.facebookUrl),
    campusAddress: nullable(input.campusAddress),
    mapUrl: nullable(input.mapUrl),
    applicationUrl: nullable(input.applicationUrl),
  };
}

async function assertProgramme(programmeId: string): Promise<void> {
  const found = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { id: true },
  });
  if (!found) throw new PublicProgrammeInfoNotFoundError("Programme not found");
}

async function getFaq(programmeId: string, id: string) {
  const faq = await prisma.programmeFaq.findFirst({ where: { id, programmeId } });
  if (!faq) throw new PublicProgrammeInfoNotFoundError("FAQ not found");
  return faq;
}

async function getImportantDate(programmeId: string, id: string) {
  const item = await prisma.programmeImportantDate.findFirst({ where: { id, programmeId } });
  if (!item) throw new PublicProgrammeInfoNotFoundError("Important date not found");
  return item;
}

export const publicProgrammeInfoService = {
  async overview(programmeId: string) {
    await assertProgramme(programmeId);
    const [faqTotal, faqPublished, importantDateTotal, importantDatePublished, profile] =
      await prisma.$transaction([
        prisma.programmeFaq.count({ where: { programmeId } }),
        prisma.programmeFaq.count({
          where: { programmeId, status: ProgrammePublicPublicationStatus.Published },
        }),
        prisma.programmeImportantDate.count({ where: { programmeId } }),
        prisma.programmeImportantDate.count({
          where: { programmeId, status: ProgrammePublicPublicationStatus.Published },
        }),
        prisma.programmePublicProfile.findUnique({
          where: { programmeId },
          select: { id: true },
        }),
      ]);

    return {
      programmeId,
      faqTotal,
      faqPublished,
      faqDraft: faqTotal - faqPublished,
      importantDateTotal,
      importantDatePublished,
      importantDateDraft: importantDateTotal - importantDatePublished,
      hasProfile: Boolean(profile),
    };
  },

  async listFaqs(programmeId: string) {
    await assertProgramme(programmeId);
    return prisma.programmeFaq.findMany({
      where: { programmeId },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { question: "asc" }],
    });
  },

  async createFaq(programmeId: string, input: ProgrammeFaqAdminWrite) {
    await assertProgramme(programmeId);
    return prisma.programmeFaq.create({
      data: {
        programmeId,
        ...faqData(input),
        status: ProgrammePublicPublicationStatus.Draft,
        publishedAt: null,
      },
    });
  },

  async updateFaq(programmeId: string, id: string, input: ProgrammeFaqAdminWrite) {
    await getFaq(programmeId, id);
    return prisma.programmeFaq.update({ where: { id }, data: faqData(input) });
  },

  async publishFaq(programmeId: string, id: string) {
    await getFaq(programmeId, id);
    return prisma.programmeFaq.update({
      where: { id },
      data: { status: ProgrammePublicPublicationStatus.Published, publishedAt: new Date() },
    });
  },

  async unpublishFaq(programmeId: string, id: string) {
    await getFaq(programmeId, id);
    return prisma.programmeFaq.update({
      where: { id },
      data: { status: ProgrammePublicPublicationStatus.Draft, publishedAt: null },
    });
  },

  async deleteFaq(programmeId: string, id: string) {
    const faq = await getFaq(programmeId, id);
    if (faq.status === ProgrammePublicPublicationStatus.Published) {
      throw new PublicProgrammeInfoConflictError(
        "Published FAQs must be unpublished before deletion.",
      );
    }
    await prisma.programmeFaq.delete({ where: { id } });
  },

  async listImportantDates(programmeId: string) {
    await assertProgramme(programmeId);
    return prisma.programmeImportantDate.findMany({
      where: { programmeId },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    });
  },

  async createImportantDate(
    programmeId: string,
    input: ProgrammeImportantDateAdminWrite,
  ) {
    await assertProgramme(programmeId);
    return prisma.programmeImportantDate.create({
      data: {
        programmeId,
        ...importantDateData(input),
        status: ProgrammePublicPublicationStatus.Draft,
        publishedAt: null,
      },
    });
  },

  async updateImportantDate(
    programmeId: string,
    id: string,
    input: ProgrammeImportantDateAdminWrite,
  ) {
    await getImportantDate(programmeId, id);
    return prisma.programmeImportantDate.update({
      where: { id },
      data: importantDateData(input),
    });
  },

  async publishImportantDate(programmeId: string, id: string) {
    await getImportantDate(programmeId, id);
    return prisma.programmeImportantDate.update({
      where: { id },
      data: { status: ProgrammePublicPublicationStatus.Published, publishedAt: new Date() },
    });
  },

  async unpublishImportantDate(programmeId: string, id: string) {
    await getImportantDate(programmeId, id);
    return prisma.programmeImportantDate.update({
      where: { id },
      data: { status: ProgrammePublicPublicationStatus.Draft, publishedAt: null },
    });
  },

  async deleteImportantDate(programmeId: string, id: string) {
    const item = await getImportantDate(programmeId, id);
    if (item.status === ProgrammePublicPublicationStatus.Published) {
      throw new PublicProgrammeInfoConflictError(
        "Published important dates must be unpublished before deletion.",
      );
    }
    await prisma.programmeImportantDate.delete({ where: { id } });
  },

  async getProfile(programmeId: string) {
    await assertProgramme(programmeId);
    return prisma.programmePublicProfile.findUnique({ where: { programmeId } });
  },

  async upsertProfile(programmeId: string, input: ProgrammePublicProfileAdminWrite) {
    await assertProgramme(programmeId);
    const data = profileData(input);
    return prisma.programmePublicProfile.upsert({
      where: { programmeId },
      create: { programmeId, ...data },
      update: data,
    });
  },
};
