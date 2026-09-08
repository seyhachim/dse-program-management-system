import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { ProgrammeFaqAdminWrite } from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import {
  MAX_PUBLIC_FEATURED_FAQS,
  PublicProgrammeInfoConflictError,
  publicProgrammeInfoService,
} from "./public-programme-info-service.ts";

const RUN_DB_TESTS = process.env.PUBLIC_PROGRAMME_INFO_DB_TESTS === "1";
const programmeId = "public-featured-limit-test";

function faqInput(index: number): ProgrammeFaqAdminWrite {
  return {
    category: "About",
    slug: `featured-limit-${index}`,
    question: `Featured FAQ ${index}?`,
    answer: `Answer ${index}`,
    shortAnswer: null,
    keywords: [`featured-${index}`],
    questionKm: null,
    answerKm: null,
    shortAnswerKm: null,
    keywordsKm: [],
    sortOrder: index,
    isFeatured: true,
    sourceLabel: null,
    sourceUrl: null,
    reviewedAt: null,
  };
}

describe.skipIf(!RUN_DB_TESTS)("public programme featured FAQ publish limit", () => {
  beforeAll(async () => {
    await prisma.programmeFaq.deleteMany({ where: { programmeId } });
    await prisma.programme.deleteMany({ where: { id: programmeId } });
    await prisma.programme.create({
      data: {
        id: programmeId,
        code: "PUB-FEATURED-LIMIT",
        name: "Public FAQ featured limit test",
      },
    });
  });

  afterAll(async () => {
    await prisma.programmeFaq.deleteMany({ where: { programmeId } });
    await prisma.programme.deleteMany({ where: { id: programmeId } });
  });

  test(`allows ${MAX_PUBLIC_FEATURED_FAQS} important FAQs and rejects the next publish`, async () => {
    const ids: string[] = [];
    for (let index = 1; index <= MAX_PUBLIC_FEATURED_FAQS + 1; index += 1) {
      const created = await publicProgrammeInfoService.createFaq(
        programmeId,
        faqInput(index),
      );
      ids.push(created.id);
    }

    for (const id of ids.slice(0, MAX_PUBLIC_FEATURED_FAQS)) {
      await publicProgrammeInfoService.publishFaq(programmeId, id);
    }

    await expect(
      publicProgrammeInfoService.publishFaq(
        programmeId,
        ids[MAX_PUBLIC_FEATURED_FAQS]!,
      ),
    ).rejects.toBeInstanceOf(PublicProgrammeInfoConflictError);

    const publishedFeatured = await prisma.programmeFaq.count({
      where: {
        programmeId,
        isFeatured: true,
        status: "Published",
      },
    });
    expect(publishedFeatured).toBe(MAX_PUBLIC_FEATURED_FAQS);

    await publicProgrammeInfoService.unpublishFaq(programmeId, ids[0]!);
    await publicProgrammeInfoService.publishFaq(
      programmeId,
      ids[MAX_PUBLIC_FEATURED_FAQS]!,
    );

    const afterReplacement = await prisma.programmeFaq.count({
      where: {
        programmeId,
        isFeatured: true,
        status: "Published",
      },
    });
    expect(afterReplacement).toBe(MAX_PUBLIC_FEATURED_FAQS);
  });
});
