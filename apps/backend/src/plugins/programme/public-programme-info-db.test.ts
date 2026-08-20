import { afterAll, describe, expect, test } from "bun:test";
import {
  PrismaClient,
  ProgrammeFaqCategory,
  ProgrammeImportantDateKind,
  ProgrammePublicPublicationStatus,
} from "@prisma/client";

const dbTestsEnabled = process.env.PUBLIC_PROGRAMME_INFO_DB_TESTS === "1";
const describeDb = dbTestsEnabled ? describe : describe.skip;
const prisma = new PrismaClient();

const suffix = () => crypto.randomUUID().slice(0, 8);

async function createProgramme() {
  const token = suffix();
  return prisma.programme.create({
    data: {
      id: `public-info-${token}`,
      code: `PI${token}`,
      name: `Public Info Test Programme ${token}`,
    },
  });
}

function faqData(programmeId: string) {
  const token = suffix();
  return {
    programmeId,
    category: ProgrammeFaqCategory.Admission,
    slug: `admission-${token}`,
    question: "Who can apply?",
    answer: "Applicants should follow the published programme admission rules.",
  } as const;
}

function asPromise<T>(value: PromiseLike<T>): Promise<T> {
  return Promise.resolve(value);
}

describeDb("public programme information database invariants", () => {
  test("creates FAQs as drafts with stable defaults", async () => {
    const programme = await createProgramme();
    const faq = await prisma.programmeFaq.create({ data: faqData(programme.id) });

    expect(faq.status).toBe(ProgrammePublicPublicationStatus.Draft);
    expect(faq.publishedAt).toBeNull();
    expect(faq.keywords).toEqual([]);
    expect(faq.sortOrder).toBe(0);
    expect(faq.isFeatured).toBe(false);
  });

  test("reads and updates an FAQ through a draft-to-published round trip", async () => {
    const programme = await createProgramme();
    const created = await prisma.programmeFaq.create({ data: faqData(programme.id) });

    const read = await prisma.programmeFaq.findUniqueOrThrow({ where: { id: created.id } });
    expect(read.status).toBe(ProgrammePublicPublicationStatus.Draft);
    expect(read.publishedAt).toBeNull();

    const publishedAt = new Date();
    const updated = await prisma.programmeFaq.update({
      where: { id: created.id },
      data: {
        answer: "Updated approved admission guidance.",
        keywords: ["admission", "apply"],
        isFeatured: true,
        status: ProgrammePublicPublicationStatus.Published,
        publishedAt,
      },
    });

    expect(updated.answer).toBe("Updated approved admission guidance.");
    expect(updated.keywords).toEqual(["admission", "apply"]);
    expect(updated.isFeatured).toBe(true);
    expect(updated.status).toBe(ProgrammePublicPublicationStatus.Published);
    expect(updated.publishedAt?.getTime()).toBe(publishedAt.getTime());
  });

  test("enforces globally unique stable FAQ slugs", async () => {
    const firstProgramme = await createProgramme();
    const secondProgramme = await createProgramme();
    const data = faqData(firstProgramme.id);

    await prisma.programmeFaq.create({ data });

    await expect(
      asPromise(
        prisma.programmeFaq.create({
          data: { ...data, programmeId: secondProgramme.id },
        }),
      ),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  test("database rejects Published FAQ without publishedAt", async () => {
    const programme = await createProgramme();

    await expect(
      asPromise(
        prisma.programmeFaq.create({
          data: {
            ...faqData(programme.id),
            status: ProgrammePublicPublicationStatus.Published,
          },
        }),
      ),
    ).rejects.toThrow("ProgrammeFaq_publication_state_check");
  });

  test("database rejects Draft FAQ with publishedAt", async () => {
    const programme = await createProgramme();

    await expect(
      asPromise(
        prisma.programmeFaq.create({
          data: {
            ...faqData(programme.id),
            status: ProgrammePublicPublicationStatus.Draft,
            publishedAt: new Date(),
          },
        }),
      ),
    ).rejects.toThrow("ProgrammeFaq_publication_state_check");
  });

  test("publishes an FAQ only with an explicit publication timestamp", async () => {
    const programme = await createProgramme();
    const publishedAt = new Date();
    const faq = await prisma.programmeFaq.create({
      data: {
        ...faqData(programme.id),
        status: ProgrammePublicPublicationStatus.Published,
        publishedAt,
        keywords: ["admission", "apply"],
      },
    });

    expect(faq.status).toBe(ProgrammePublicPublicationStatus.Published);
    expect(faq.publishedAt?.getTime()).toBe(publishedAt.getTime());
    expect(faq.keywords).toEqual(["admission", "apply"]);
  });

  test("important dates are typed and reject inverted ranges", async () => {
    const programme = await createProgramme();

    await expect(
      asPromise(
        prisma.programmeImportantDate.create({
          data: {
            programmeId: programme.id,
            kind: ProgrammeImportantDateKind.ApplicationDeadline,
            title: "Application deadline",
            date: new Date("2026-09-10T00:00:00.000Z"),
            endDate: new Date("2026-09-01T00:00:00.000Z"),
          },
        }),
      ),
    ).rejects.toThrow("ProgrammeImportantDate_range_check");
  });

  test("important dates enforce the same publication boundary", async () => {
    const programme = await createProgramme();

    await expect(
      asPromise(
        prisma.programmeImportantDate.create({
          data: {
            programmeId: programme.id,
            kind: ProgrammeImportantDateKind.SemesterStart,
            title: "Semester starts",
            date: new Date("2026-11-01T00:00:00.000Z"),
            status: ProgrammePublicPublicationStatus.Published,
          },
        }),
      ),
    ).rejects.toThrow("ProgrammeImportantDate_publication_state_check");
  });

  test("stores one structured public profile per programme", async () => {
    const programme = await createProgramme();
    const profile = await prisma.programmePublicProfile.create({
      data: {
        programmeId: programme.id,
        programmeName: "Bachelor of Engineering in Data Science and Engineering",
        shortName: "DSE",
        overview: "Public programme overview",
        admissionEmail: "admission@example.edu",
        websiteUrl: "https://example.edu/dse",
      },
    });

    expect(profile.shortName).toBe("DSE");

    await expect(
      asPromise(
        prisma.programmePublicProfile.create({
          data: {
            programmeId: programme.id,
            programmeName: "Duplicate",
            shortName: "DSE2",
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  test("all public-information records require an existing programme", async () => {
    await expect(
      asPromise(
        prisma.programmeFaq.create({
          data: faqData(`missing-${suffix()}`),
        }),
      ),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
