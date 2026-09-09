import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { publicProgrammeInfoService } from "./public-programme-info-service.ts";
import { publicProgrammeReadService } from "./public-programme-read-service.ts";

const enabled = process.env.PUBLIC_PROGRAMME_INFO_READ_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

function token(): string {
  return crypto.randomUUID().slice(0, 8);
}

async function createProgramme() {
  const suffix = token();
  return prisma.programme.create({
    data: {
      id: `public-cache-${suffix}`,
      code: `PC${suffix}`,
      name: `Public Cache Test ${suffix}`,
      status: "active",
    },
  });
}

function profileInput(overview: string) {
  return {
    programmeName: "Data Science and Engineering",
    shortName: "DSE",
    overview,
    admissionEmail: "admission@example.edu",
    phone: null,
    websiteUrl: null,
    facebookUrl: null,
    campusAddress: null,
    mapUrl: null,
    applicationUrl: null,
  };
}

describeDb("public programme read cache invalidation", () => {
  test("profile upsert invalidates a warmed public profile immediately", async () => {
    const programme = await createProgramme();
    await publicProgrammeInfoService.upsertProfile(
      programme.id,
      profileInput("Before update"),
    );

    expect((await publicProgrammeReadService.getProgramme(programme.id)).overview).toBe(
      "Before update",
    );

    await publicProgrammeInfoService.upsertProfile(
      programme.id,
      profileInput("After update"),
    );

    expect((await publicProgrammeReadService.getProgramme(programme.id)).overview).toBe(
      "After update",
    );
  });

  test("publishing after a warmed empty FAQ snapshot becomes visible immediately", async () => {
    const programme = await createProgramme();
    expect(await publicProgrammeReadService.listFaqs(programme.id)).toEqual([]);

    const faq = await publicProgrammeInfoService.createFaq(programme.id, {
      category: "Admission",
      slug: `cache-publish-${token()}`,
      question: "Can I apply?",
      answer: "Yes, follow the published admission process.",
      shortAnswer: null,
      keywords: ["admission"],
      sortOrder: 0,
      isFeatured: true,
      sourceLabel: "DSE",
      sourceUrl: null,
      reviewedAt: new Date("2026-09-09T00:00:00.000Z"),
    });
    await publicProgrammeInfoService.publishFaq(programme.id, faq.id);

    expect((await publicProgrammeReadService.listFaqs(programme.id)).map((row) => row.slug)).toEqual([
      faq.slug,
    ]);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
