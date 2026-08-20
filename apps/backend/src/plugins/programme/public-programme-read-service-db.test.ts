import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { publicProgrammeInfoService } from "./public-programme-info-service.ts";
import {
  PublicProgrammeReadNotFoundError,
  publicProgrammeReadService,
} from "./public-programme-read-service.ts";

const enabled = process.env.PUBLIC_PROGRAMME_INFO_READ_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

function token(): string {
  return crypto.randomUUID().slice(0, 8);
}

async function createProgramme(status = "active") {
  const suffix = token();
  return prisma.programme.create({
    data: {
      id: `public-read-${suffix}`,
      code: `PR${suffix}`,
      name: `Public Read Test ${suffix}`,
      status,
    },
  });
}

function faqInput(slug: string, category: "Admission" | "Careers" | "FeesScholarships" = "Admission") {
  return {
    category,
    slug,
    question: `Question ${slug}?`,
    answer: `Approved answer for ${slug}.`,
    shortAnswer: null,
    keywords: ["internal-search-term"],
    sortOrder: 0,
    isFeatured: false,
    sourceLabel: "DSE",
    sourceUrl: "https://example.edu/dse",
    reviewedAt: new Date("2026-08-20T00:00:00.000Z"),
  } as const;
}

describeDb("published-only public programme read service", () => {
  test("lists published FAQs only and exposes the public DTO allow-list", async () => {
    const programme = await createProgramme();
    const published = await publicProgrammeInfoService.createFaq(
      programme.id,
      faqInput(`published-${token()}`),
    );
    await publicProgrammeInfoService.publishFaq(programme.id, published.id);
    await publicProgrammeInfoService.createFaq(programme.id, faqInput(`draft-${token()}`));

    const rows = await publicProgrammeReadService.listFaqs(programme.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe(published.slug);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "answer",
      "category",
      "isFeatured",
      "question",
      "shortAnswer",
      "slug",
      "sourceLabel",
      "sourceUrl",
    ].sort());
    expect(rows[0]).not.toHaveProperty("id");
    expect(rows[0]).not.toHaveProperty("programmeId");
    expect(rows[0]).not.toHaveProperty("status");
    expect(rows[0]).not.toHaveProperty("publishedAt");
    expect(rows[0]).not.toHaveProperty("keywords");
    expect(rows[0]).not.toHaveProperty("reviewedAt");
  });

  test("draft and unknown FAQ slugs are indistinguishable publicly", async () => {
    const programme = await createProgramme();
    const draft = await publicProgrammeInfoService.createFaq(
      programme.id,
      faqInput(`draft-slug-${token()}`),
    );

    await expect(
      publicProgrammeReadService.getFaqBySlug(programme.id, draft.slug),
    ).rejects.toBeInstanceOf(PublicProgrammeReadNotFoundError);
    await expect(
      publicProgrammeReadService.getFaqBySlug(programme.id, `missing-${token()}`),
    ).rejects.toBeInstanceOf(PublicProgrammeReadNotFoundError);
  });

  test("programme scoping prevents cross-programme slug reads", async () => {
    const owner = await createProgramme();
    const other = await createProgramme();
    const faq = await publicProgrammeInfoService.createFaq(owner.id, faqInput(`scope-${token()}`));
    await publicProgrammeInfoService.publishFaq(owner.id, faq.id);

    await expect(
      publicProgrammeReadService.getFaqBySlug(other.id, faq.slug),
    ).rejects.toBeInstanceOf(PublicProgrammeReadNotFoundError);
  });

  test("unpublishing immediately revokes FAQ visibility", async () => {
    const programme = await createProgramme();
    const faq = await publicProgrammeInfoService.createFaq(programme.id, faqInput(`revoke-${token()}`));
    await publicProgrammeInfoService.publishFaq(programme.id, faq.id);
    expect((await publicProgrammeReadService.getFaqBySlug(programme.id, faq.slug)).slug).toBe(faq.slug);

    await publicProgrammeInfoService.unpublishFaq(programme.id, faq.id);
    await expect(
      publicProgrammeReadService.getFaqBySlug(programme.id, faq.slug),
    ).rejects.toBeInstanceOf(PublicProgrammeReadNotFoundError);
  });

  test("FAQ category counts derive from published rows only", async () => {
    const programme = await createProgramme();
    const one = await publicProgrammeInfoService.createFaq(programme.id, faqInput(`a-${token()}`, "Admission"));
    const two = await publicProgrammeInfoService.createFaq(programme.id, faqInput(`b-${token()}`, "Admission"));
    await publicProgrammeInfoService.publishFaq(programme.id, one.id);
    await publicProgrammeInfoService.publishFaq(programme.id, two.id);
    await publicProgrammeInfoService.createFaq(programme.id, faqInput(`career-${token()}`, "Careers"));

    expect(await publicProgrammeReadService.listFaqCategories(programme.id)).toEqual([
      { category: "Admission", count: 2 },
    ]);
  });

  test("important dates are published-only and unpublish revokes them", async () => {
    const programme = await createProgramme();
    const published = await publicProgrammeInfoService.createImportantDate(programme.id, {
      kind: "ApplicationDeadline",
      title: "Application deadline",
      description: "Confirmed deadline",
      date: new Date("2026-10-01T00:00:00.000Z"),
      endDate: null,
      sortOrder: 0,
    });
    await publicProgrammeInfoService.publishImportantDate(programme.id, published.id);
    await publicProgrammeInfoService.createImportantDate(programme.id, {
      kind: "SemesterStart",
      title: "Draft semester start",
      description: "Not announced",
      date: new Date("2026-11-01T00:00:00.000Z"),
      endDate: null,
      sortOrder: 0,
    });

    const rows = await publicProgrammeReadService.listImportantDates(programme.id);
    expect(rows).toEqual([
      {
        kind: "ApplicationDeadline",
        title: "Application deadline",
        description: "Confirmed deadline",
        date: "2026-10-01",
        endDate: null,
      },
    ]);

    await publicProgrammeInfoService.unpublishImportantDate(programme.id, published.id);
    expect(await publicProgrammeReadService.listImportantDates(programme.id)).toEqual([]);
  });

  test("profile and contact responses expose only structured public fields", async () => {
    const programme = await createProgramme();
    await publicProgrammeInfoService.upsertProfile(programme.id, {
      programmeName: "Data Science and Engineering",
      shortName: "DSE",
      overview: "Official public overview",
      admissionEmail: "admission@example.edu",
      phone: "+855 00 000 000",
      websiteUrl: "https://example.edu/dse",
      facebookUrl: null,
      campusAddress: "Phnom Penh",
      mapUrl: null,
      applicationUrl: "https://example.edu/apply",
    });

    const profile = await publicProgrammeReadService.getProgramme(programme.id);
    expect(profile).not.toHaveProperty("id");
    expect(profile).not.toHaveProperty("programmeId");
    expect(profile).not.toHaveProperty("createdAt");
    expect(profile).not.toHaveProperty("updatedAt");
    expect((await publicProgrammeReadService.getContact(programme.id)).applicationUrl)
      .toBe("https://example.edu/apply");
  });

  test("inactive and unknown programmes fail closed", async () => {
    const inactive = await createProgramme("inactive");
    await expect(publicProgrammeReadService.listFaqs(inactive.id)).rejects.toBeInstanceOf(
      PublicProgrammeReadNotFoundError,
    );
    await expect(publicProgrammeReadService.listFaqs(`missing-${token()}`)).rejects.toBeInstanceOf(
      PublicProgrammeReadNotFoundError,
    );
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
