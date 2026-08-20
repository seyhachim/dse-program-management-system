import { afterAll, describe, expect, test } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  PublicProgrammeInfoConflictError,
  PublicProgrammeInfoNotFoundError,
  publicProgrammeInfoService,
} from "./public-programme-info-service.ts";

const enabled = process.env.PUBLIC_PROGRAMME_INFO_ADMIN_DB_TESTS === "1";
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

function token(): string {
  return crypto.randomUUID().slice(0, 8);
}

async function createProgramme() {
  const suffix = token();
  return prisma.programme.create({
    data: {
      id: `public-admin-${suffix}`,
      code: `PA${suffix}`,
      name: `Public Admin Test ${suffix}`,
    },
  });
}

describeDb("public programme information admin service", () => {
  test("FAQ create -> edit -> publish -> unpublish -> delete round trip", async () => {
    const programme = await createProgramme();
    const slug = `can-i-apply-${token()}`;

    const created = await publicProgrammeInfoService.createFaq(programme.id, {
      category: "Admission",
      slug,
      question: "Can I apply?",
      answer: "Check the confirmed admission requirements.",
      shortAnswer: null,
      keywords: ["apply"],
      sortOrder: 1,
      isFeatured: true,
      sourceLabel: "Admissions office",
      sourceUrl: "https://example.edu/admission",
      reviewedAt: null,
    });
    expect(created.status).toBe("Draft");
    expect(created.publishedAt).toBeNull();

    const updated = await publicProgrammeInfoService.updateFaq(programme.id, created.id, {
      category: "Admission",
      slug,
      question: "Who can apply?",
      answer: "Follow the confirmed DSE admission requirements.",
      shortAnswer: "See the current admission requirements.",
      keywords: ["apply", "eligibility"],
      sortOrder: 2,
      isFeatured: false,
      sourceLabel: "Admissions office",
      sourceUrl: null,
      reviewedAt: new Date("2026-08-20T00:00:00.000Z"),
    });
    expect(updated.question).toBe("Who can apply?");
    expect(updated.status).toBe("Draft");

    const published = await publicProgrammeInfoService.publishFaq(programme.id, created.id);
    expect(published.status).toBe("Published");
    expect(published.publishedAt).toBeInstanceOf(Date);

    await expect(
      publicProgrammeInfoService.deleteFaq(programme.id, created.id),
    ).rejects.toBeInstanceOf(PublicProgrammeInfoConflictError);

    const unpublished = await publicProgrammeInfoService.unpublishFaq(programme.id, created.id);
    expect(unpublished.status).toBe("Draft");
    expect(unpublished.publishedAt).toBeNull();

    await publicProgrammeInfoService.deleteFaq(programme.id, created.id);
    expect(await prisma.programmeFaq.findUnique({ where: { id: created.id } })).toBeNull();
  });

  test("important date lifecycle preserves typed date range", async () => {
    const programme = await createProgramme();
    const item = await publicProgrammeInfoService.createImportantDate(programme.id, {
      kind: "ApplicationDeadline",
      title: "Application deadline",
      description: "Submit before the deadline.",
      date: new Date("2026-10-01T00:00:00.000Z"),
      endDate: null,
      sortOrder: 0,
    });
    expect(item.status).toBe("Draft");

    const published = await publicProgrammeInfoService.publishImportantDate(programme.id, item.id);
    expect(published.status).toBe("Published");
    expect(published.publishedAt).toBeInstanceOf(Date);

    const unpublished = await publicProgrammeInfoService.unpublishImportantDate(programme.id, item.id);
    expect(unpublished.status).toBe("Draft");
    await publicProgrammeInfoService.deleteImportantDate(programme.id, item.id);
  });

  test("public profile upserts official contact information", async () => {
    const programme = await createProgramme();
    const first = await publicProgrammeInfoService.upsertProfile(programme.id, {
      programmeName: "Data Science and Engineering",
      shortName: "DSE",
      overview: "Public overview",
      admissionEmail: "admission@example.edu",
      phone: null,
      websiteUrl: "https://example.edu/dse",
      facebookUrl: null,
      campusAddress: "Phnom Penh",
      mapUrl: null,
      applicationUrl: null,
    });
    expect(first.admissionEmail).toBe("admission@example.edu");

    const second = await publicProgrammeInfoService.upsertProfile(programme.id, {
      programmeName: "Data Science and Engineering",
      shortName: "DSE",
      overview: "Updated public overview",
      admissionEmail: "dse@example.edu",
      phone: "+855 00 000 000",
      websiteUrl: null,
      facebookUrl: null,
      campusAddress: "Phnom Penh",
      mapUrl: null,
      applicationUrl: null,
    });
    expect(second.id).toBe(first.id);
    expect(second.overview).toBe("Updated public overview");
    expect(second.phone).toBe("+855 00 000 000");
  });

  test("programme scoping fails closed for records owned by another programme", async () => {
    const owner = await createProgramme();
    const other = await createProgramme();
    const faq = await publicProgrammeInfoService.createFaq(owner.id, {
      category: "About",
      slug: `about-${token()}`,
      question: "What is DSE?",
      answer: "A public test answer.",
      shortAnswer: null,
      keywords: [],
      sortOrder: 0,
      isFeatured: false,
      sourceLabel: null,
      sourceUrl: null,
      reviewedAt: null,
    });

    await expect(
      publicProgrammeInfoService.publishFaq(other.id, faq.id),
    ).rejects.toBeInstanceOf(PublicProgrammeInfoNotFoundError);
  });

  test("overview reports draft/published counts and profile readiness", async () => {
    const programme = await createProgramme();
    const draft = await publicProgrammeInfoService.createFaq(programme.id, {
      category: "Careers",
      slug: `career-${token()}`,
      question: "What careers are available?",
      answer: "See the approved careers guidance.",
      shortAnswer: null,
      keywords: [],
      sortOrder: 0,
      isFeatured: false,
      sourceLabel: null,
      sourceUrl: null,
      reviewedAt: null,
    });
    const second = await publicProgrammeInfoService.createFaq(programme.id, {
      category: "About",
      slug: `about-${token()}`,
      question: "Why DSE?",
      answer: "See the approved programme information.",
      shortAnswer: null,
      keywords: [],
      sortOrder: 0,
      isFeatured: false,
      sourceLabel: null,
      sourceUrl: null,
      reviewedAt: null,
    });
    await publicProgrammeInfoService.publishFaq(programme.id, second.id);

    const overview = await publicProgrammeInfoService.overview(programme.id);
    expect(overview.faqTotal).toBe(2);
    expect(overview.faqPublished).toBe(1);
    expect(overview.faqDraft).toBe(1);
    expect(overview.hasProfile).toBe(false);

    await publicProgrammeInfoService.deleteFaq(programme.id, draft.id);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
