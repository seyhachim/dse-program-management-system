import { describe, expect, test } from "bun:test";
import {
  ProgrammeFaqInputSchema,
  ProgrammeImportantDateInputSchema,
  ProgrammePublicProfileInputSchema,
} from "./public-programme-info.ts";

const baseFaq = {
  programmeId: "dse",
  category: "Admission" as const,
  slug: "do-i-need-programming-experience",
  question: "Do I need programming experience?",
  answer: "No. The programme develops programming skills progressively.",
};

describe("public programme information validation", () => {
  test("accepts a draft FAQ without publishedAt", () => {
    const parsed = ProgrammeFaqInputSchema.parse(baseFaq);
    expect(parsed.status).toBe("Draft");
    expect(parsed.publishedAt).toBeUndefined();
    expect(parsed.keywords).toEqual([]);
  });

  test("requires publishedAt for a published FAQ", () => {
    const parsed = ProgrammeFaqInputSchema.safeParse({
      ...baseFaq,
      status: "Published",
    });
    expect(parsed.success).toBe(false);
  });

  test("rejects publishedAt on a draft FAQ", () => {
    const parsed = ProgrammeFaqInputSchema.safeParse({
      ...baseFaq,
      status: "Draft",
      publishedAt: new Date(),
    });
    expect(parsed.success).toBe(false);
  });

  test("requires stable lowercase kebab-case FAQ slugs", () => {
    expect(
      ProgrammeFaqInputSchema.safeParse({
        ...baseFaq,
        slug: "Admission FAQ",
      }).success,
    ).toBe(false);
  });

  test("rejects an important-date range ending before it starts", () => {
    const parsed = ProgrammeImportantDateInputSchema.safeParse({
      programmeId: "dse",
      kind: "ApplicationDeadline",
      title: "Application deadline",
      date: "2026-09-10",
      endDate: "2026-09-01",
    });
    expect(parsed.success).toBe(false);
  });

  test("requires publishedAt for a published important date", () => {
    const parsed = ProgrammeImportantDateInputSchema.safeParse({
      programmeId: "dse",
      kind: "SemesterStart",
      title: "Semester starts",
      date: "2026-11-01",
      status: "Published",
    });
    expect(parsed.success).toBe(false);
  });

  test("validates structured public contact/profile settings", () => {
    const parsed = ProgrammePublicProfileInputSchema.parse({
      programmeId: "dse",
      programmeName: "Bachelor of Engineering in Data Science and Engineering",
      shortName: "DSE",
      admissionEmail: "admission@example.edu",
      websiteUrl: "https://example.edu/dse",
    });
    expect(parsed.shortName).toBe("DSE");
  });

  test("rejects invalid public URLs", () => {
    expect(
      ProgrammePublicProfileInputSchema.safeParse({
        programmeId: "dse",
        programmeName: "Data Science and Engineering",
        shortName: "DSE",
        websiteUrl: "not-a-url",
      }).success,
    ).toBe(false);
  });
});
