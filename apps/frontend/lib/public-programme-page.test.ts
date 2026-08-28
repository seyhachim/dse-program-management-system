import { describe, expect, test } from "bun:test";
import type {
  PublicProgrammeFaq,
  PublicProgrammeImportantDate,
  PublicProgrammeProfile,
} from "@dse-pms/shared-types";
import { publicProgrammeContent } from "./public-programme";
import {
  mergePublicProgrammePage,
  type PublishedProgrammeInputs,
  type PublicCurriculumCourseDto,
  type PublicCurriculumProvenanceDto,
  type PublicCurriculumTotalsDto,
} from "./public-programme-page";

const unavailable = { kind: "unavailable" } as const;

function inputs(overrides: Partial<PublishedProgrammeInputs> = {}): PublishedProgrammeInputs {
  return {
    profile: unavailable,
    faqs: unavailable,
    dates: unavailable,
    curriculumCourses: unavailable,
    curriculumTotals: unavailable,
    ...overrides,
  };
}

const profile: PublicProgrammeProfile = {
  programmeName: "Bachelor of Engineering in Data Science and Engineering",
  shortName: "DSE",
  overview: "Published DSE programme overview.",
  admissionEmail: "admission@example.edu",
  phone: "+855 12 345 678",
  websiteUrl: "https://example.edu/dse",
  facebookUrl: null,
  campusAddress: "RUPP, Phnom Penh",
  mapUrl: null,
  applicationUrl: "https://example.edu/apply",
};

const provenance: PublicCurriculumProvenanceDto = {
  curriculumVersionId: "curriculum-v2",
  curriculumVersion: "2.0",
  status: "Active",
  sourceFileName: "DSE Curriculum.json",
  sourceSha256: "a".repeat(64),
};

const courses: PublicCurriculumCourseDto[] = [
  {
    code: "MTH101",
    title: "Mathematics I",
    yearLevel: 1,
    semester: "First",
    credits: 3,
    provenance,
  },
  {
    code: "PRG102",
    title: "Programming II",
    yearLevel: 1,
    semester: "Second",
    credits: 4,
    provenance,
  },
  {
    code: "PAN202",
    title: "Predictive Analytics",
    yearLevel: 2,
    semester: "Second",
    credits: 3,
    provenance,
  },
];

const totals: PublicCurriculumTotalsDto = {
  totalCourses: 42,
  totalCredits: 144,
  totalWeeklyHours: 160,
  provenance,
};

const faqs: PublicProgrammeFaq[] = [
  {
    slug: "admission-requirements",
    category: "Admission",
    question: "What are the admission requirements?",
    answer: "Published admission requirements.",
    shortAnswer: null,
    isFeatured: false,
    sourceLabel: null,
    sourceUrl: null,
  },
  {
    slug: "programming-experience",
    category: "Admission",
    question: "Do I need programming experience?",
    answer: "Programming experience is not required.",
    shortAnswer: "No prior programming experience is required.",
    isFeatured: true,
    sourceLabel: null,
    sourceUrl: null,
  },
];

const dates: PublicProgrammeImportantDate[] = [
  {
    kind: "EntranceExam",
    title: "Entrance exam",
    description: "Published exam date.",
    date: "2026-11-15",
    endDate: null,
  },
  {
    kind: "ApplicationDeadline",
    title: "Application deadline",
    description: "Published application deadline.",
    date: "2026-10-15",
    endDate: null,
  },
];

describe("public programme page merge", () => {
  test("preserves the curated page when every PMS request is unavailable", () => {
    const result = mergePublicProgrammePage(publicProgrammeContent, inputs());

    expect(result.source).toBe("curated-fallback");
    expect(result.hero).toEqual(publicProgrammeContent.hero);
    expect(result.snapshot).toEqual(publicProgrammeContent.snapshot);
    expect(result.curriculumPreview.sourceBadge).toBe("Curriculum preview");
    expect(result.curriculumPreview.isOfficialPublishedCurriculum).toBe(false);
    expect(result.faqs).toEqual([]);
    expect(result.importantDates).toEqual([]);
    expect(result.contact).toBeNull();
  });

  test("merges published factual profile fields while keeping curated presentation copy", () => {
    const result = mergePublicProgrammePage(
      publicProgrammeContent,
      inputs({ profile: { kind: "available", value: profile } }),
    );

    expect(result.source).toBe("mixed");
    expect(result.hero.title).toBe(profile.programmeName);
    expect(result.hero.description).toBe(profile.overview);
    expect(result.hero.tagline).toBe(publicProgrammeContent.hero.tagline);
    expect(result.contact?.admissionEmail).toBe(profile.admissionEmail);
    expect(result.contact?.applicationUrl).toBe(profile.applicationUrl);
  });

  test("uses published curriculum courses and totals instead of the illustrative preview", () => {
    const result = mergePublicProgrammePage(
      publicProgrammeContent,
      inputs({
        curriculumCourses: { kind: "available", value: courses },
        curriculumTotals: { kind: "available", value: totals },
      }),
    );

    expect(result.snapshot.find((item) => item.label === "Curriculum snapshot")?.value).toBe("144 Credits");
    expect(result.curriculumPreview.isOfficialPublishedCurriculum).toBe(true);
    expect(result.curriculumPreview.curriculumVersion).toBe("2.0");
    expect(result.curriculumPreview.semesters[0]?.courses).toEqual([
      { code: "MTH101", title: "Mathematics I" },
    ]);
    expect(result.curriculumPreview.semesters[1]?.courses).toEqual([
      { code: "PRG102", title: "Programming II" },
    ]);
    expect(
      result.curriculumPreview.semesters
        .flatMap((semester) => semester.courses)
        .map((course) => course.code),
    ).not.toContain("DSE101");
  });

  test("treats an explicitly published empty curriculum course collection as authoritative", () => {
    const result = mergePublicProgrammePage(
      publicProgrammeContent,
      inputs({ curriculumCourses: { kind: "available", value: [] } }),
    );

    expect(result.curriculumPreview.isOfficialPublishedCurriculum).toBe(true);
    expect(result.curriculumPreview.semesters[0]?.courses).toEqual([]);
    expect(result.curriculumPreview.semesters[1]?.courses).toEqual([]);
  });

  test("can use a published credit total while retaining the curated course preview when course reads fail", () => {
    const result = mergePublicProgrammePage(
      publicProgrammeContent,
      inputs({ curriculumTotals: { kind: "available", value: totals } }),
    );

    expect(result.sectionSources.curriculum).toBe("mixed");
    expect(result.curriculumPreview.sourceBadge).toBe("Published credits · course preview");
    expect(result.curriculumPreview.semesters[0]?.courses[0]?.code).toBe(
      publicProgrammeContent.curriculumPreview.semesters[0]?.courses[0]?.code,
    );
    expect(result.snapshot.find((item) => item.label === "Curriculum snapshot")?.value).toBe("144 Credits");
  });

  test("shows featured published FAQs and chronologically sorted published dates", () => {
    const result = mergePublicProgrammePage(
      publicProgrammeContent,
      inputs({
        faqs: { kind: "available", value: faqs },
        dates: { kind: "available", value: dates },
      }),
    );

    expect(result.faqs.map((faq) => faq.slug)).toEqual(["programming-experience"]);
    expect(result.importantDates.map((item) => item.title)).toEqual([
      "Application deadline",
      "Entrance exam",
    ]);
  });

  test("hides optional published sections when the API confirms there are no records", () => {
    const result = mergePublicProgrammePage(
      publicProgrammeContent,
      inputs({
        faqs: { kind: "available", value: [] },
        dates: { kind: "available", value: [] },
        profile: {
          kind: "available",
          value: {
            ...profile,
            admissionEmail: null,
            phone: null,
            websiteUrl: null,
            facebookUrl: null,
            campusAddress: null,
            mapUrl: null,
            applicationUrl: null,
          },
        },
      }),
    );

    expect(result.faqs).toEqual([]);
    expect(result.importantDates).toEqual([]);
    expect(result.contact).toBeNull();
    expect(result.sectionSources.faqs).toBe("hidden");
    expect(result.sectionSources.dates).toBe("hidden");
    expect(result.sectionSources.contact).toBe("hidden");
  });

  test("keeps the live loader server-only and free of Authorization headers", async () => {
    const source = await Bun.file(`${import.meta.dir}/public-programme-live.ts`).text();
    expect(source).toContain('import "server-only"');
    expect(source).not.toContain("Authorization");
    expect(source).toContain("/api/programme/public/programmes/");
  });
});
