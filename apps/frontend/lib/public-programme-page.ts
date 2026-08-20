import type {
  PublicProgrammeContact,
  PublicProgrammeFaq,
  PublicProgrammeImportantDate,
  PublicProgrammeProfile,
} from "@dse-pms/shared-types";
import type {
  PublicProgrammeContent,
  PublicProgrammeCourse,
} from "./public-programme";

export type PublishedResult<T> =
  | { kind: "available"; value: T }
  | { kind: "missing" }
  | { kind: "unavailable"; reason?: string };

export type ProgrammeSectionSource =
  | "approved-pms"
  | "mixed"
  | "curated-fallback"
  | "hidden";

export type PublicCurriculumProvenanceDto = {
  curriculumVersionId: string;
  curriculumVersion: string;
  status: "Active" | "Approved";
  sourceFileName: string | null;
  sourceSha256: string | null;
};

export type PublicCurriculumCourseDto = {
  code: string;
  title: string;
  yearLevel: number;
  semester: "First" | "Second";
  credits: number;
  provenance: PublicCurriculumProvenanceDto;
};

export type PublicCurriculumTotalsDto = {
  totalCourses: number;
  totalCredits: number;
  totalWeeklyHours: number | null;
  provenance: PublicCurriculumProvenanceDto;
};

export type PublicProgrammePageModel = Omit<
  PublicProgrammeContent,
  "source" | "curriculumPreview"
> & {
  source: "approved-pms" | "mixed" | "curated-fallback";
  curriculumPreview: PublicProgrammeContent["curriculumPreview"] & {
    sourceBadge: string;
    isOfficialPublishedCurriculum: boolean;
    curriculumVersion: string | null;
    totalCredits: number | null;
  };
  faqs: PublicProgrammeFaq[];
  importantDates: PublicProgrammeImportantDate[];
  contact: PublicProgrammeContact | null;
  sectionSources: {
    hero: ProgrammeSectionSource;
    snapshot: ProgrammeSectionSource;
    curriculum: ProgrammeSectionSource;
    faqs: ProgrammeSectionSource;
    dates: ProgrammeSectionSource;
    contact: ProgrammeSectionSource;
  };
};

export type PublishedProgrammeInputs = {
  profile: PublishedResult<PublicProgrammeProfile>;
  faqs: PublishedResult<PublicProgrammeFaq[]>;
  dates: PublishedResult<PublicProgrammeImportantDate[]>;
  curriculumCourses: PublishedResult<PublicCurriculumCourseDto[]>;
  curriculumTotals: PublishedResult<PublicCurriculumTotalsDto>;
};

function textOrFallback(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  return text ? text : fallback;
}

function mergeHero(
  fallback: PublicProgrammeContent["hero"],
  profile: PublishedResult<PublicProgrammeProfile>,
): {
  value: PublicProgrammeContent["hero"];
  source: ProgrammeSectionSource;
} {
  if (profile.kind !== "available") {
    return { value: { ...fallback }, source: "curated-fallback" };
  }

  return {
    source: "mixed",
    value: {
      eyebrow: fallback.eyebrow,
      title: textOrFallback(profile.value.programmeName, fallback.title),
      tagline: fallback.tagline,
      description: textOrFallback(profile.value.overview, fallback.description),
    },
  };
}

function mergeContact(
  profile: PublishedResult<PublicProgrammeProfile>,
): { value: PublicProgrammeContact | null; source: ProgrammeSectionSource } {
  if (profile.kind !== "available") {
    return { value: null, source: "hidden" };
  }

  const value: PublicProgrammeContact = {
    admissionEmail: profile.value.admissionEmail,
    phone: profile.value.phone,
    websiteUrl: profile.value.websiteUrl,
    facebookUrl: profile.value.facebookUrl,
    campusAddress: profile.value.campusAddress,
    mapUrl: profile.value.mapUrl,
    applicationUrl: profile.value.applicationUrl,
  };

  return Object.values(value).some(Boolean)
    ? { value, source: "approved-pms" }
    : { value: null, source: "hidden" };
}

function mergeFaqs(
  result: PublishedResult<PublicProgrammeFaq[]>,
): { value: PublicProgrammeFaq[]; source: ProgrammeSectionSource } {
  if (result.kind !== "available" || result.value.length === 0) {
    return { value: [], source: "hidden" };
  }

  const featured = result.value.filter((faq) => faq.isFeatured);
  return {
    source: "approved-pms",
    value: (featured.length > 0 ? featured : result.value).slice(0, 8),
  };
}

function mergeDates(
  result: PublishedResult<PublicProgrammeImportantDate[]>,
): { value: PublicProgrammeImportantDate[]; source: ProgrammeSectionSource } {
  if (result.kind !== "available" || result.value.length === 0) {
    return { value: [], source: "hidden" };
  }

  return {
    source: "approved-pms",
    value: [...result.value]
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(0, 8),
  };
}

function fallbackSemester(
  semester: PublicProgrammeContent["curriculumPreview"]["semesters"][number] | undefined,
  defaultTitle: string,
): { title: string; courses: PublicProgrammeCourse[] } {
  return {
    title: semester?.title ?? defaultTitle,
    courses: (semester?.courses ?? []).map((course) => ({ ...course })),
  };
}

function mergeCurriculum(
  fallback: PublicProgrammeContent["curriculumPreview"],
  courses: PublishedResult<PublicCurriculumCourseDto[]>,
  totals: PublishedResult<PublicCurriculumTotalsDto>,
): {
  value: PublicProgrammePageModel["curriculumPreview"];
  source: ProgrammeSectionSource;
} {
  const version =
    courses.kind === "available" && courses.value[0]
      ? courses.value[0].provenance.curriculumVersion
      : totals.kind === "available"
        ? totals.value.provenance.curriculumVersion
        : null;

  if (courses.kind === "available") {
    const first = courses.value
      .filter((course) => course.yearLevel === 1 && course.semester === "First")
      .map(({ code, title }) => ({ code, title }));
    const second = courses.value
      .filter((course) => course.yearLevel === 1 && course.semester === "Second")
      .map(({ code, title }) => ({ code, title }));

    return {
      source: "approved-pms",
      value: {
        heading: "Published curriculum",
        note: version
          ? `Current published DSE curriculum · version ${version}.`
          : "Current published DSE curriculum.",
        semesters: [
          { title: "Year 1 · Semester 1", courses: first },
          { title: "Year 1 · Semester 2", courses: second },
        ],
        sourceBadge: "Current published curriculum",
        isOfficialPublishedCurriculum: true,
        curriculumVersion: version,
        totalCredits: totals.kind === "available" ? totals.value.totalCredits : null,
      },
    };
  }

  if (totals.kind === "available") {
    return {
      source: "mixed",
      value: {
        heading: fallback.heading,
        note: `Published programme total: ${totals.value.totalCredits} credits. ${fallback.note}`,
        semesters: [
          fallbackSemester(fallback.semesters[0], "Semester 1 examples"),
          fallbackSemester(fallback.semesters[1], "Semester 2 examples"),
        ],
        sourceBadge: "Published credits · course preview",
        isOfficialPublishedCurriculum: false,
        curriculumVersion: version,
        totalCredits: totals.value.totalCredits,
      },
    };
  }

  return {
    source: "curated-fallback",
    value: {
      heading: fallback.heading,
      note: fallback.note,
      semesters: [
        fallbackSemester(fallback.semesters[0], "Semester 1 examples"),
        fallbackSemester(fallback.semesters[1], "Semester 2 examples"),
      ],
      sourceBadge: "Curriculum preview",
      isOfficialPublishedCurriculum: false,
      curriculumVersion: null,
      totalCredits: null,
    },
  };
}

function mergeSnapshot(
  fallback: PublicProgrammeContent["snapshot"],
  totals: PublishedResult<PublicCurriculumTotalsDto>,
): {
  value: PublicProgrammeContent["snapshot"];
  source: ProgrammeSectionSource;
} {
  if (totals.kind !== "available") {
    return {
      source: "curated-fallback",
      value: fallback.map((item) => ({ ...item })),
    };
  }

  return {
    source: "mixed",
    value: fallback.map((item) =>
      item.label === "Curriculum snapshot"
        ? { label: item.label, value: `${totals.value.totalCredits} Credits` }
        : { ...item },
    ),
  };
}

function pageSource(sources: ProgrammeSectionSource[]): PublicProgrammePageModel["source"] {
  const hasPublished = sources.some((source) => source === "approved-pms" || source === "mixed");
  return hasPublished ? "mixed" : "curated-fallback";
}

export function mergePublicProgrammePage(
  fallback: PublicProgrammeContent,
  published: PublishedProgrammeInputs,
): PublicProgrammePageModel {
  const hero = mergeHero(fallback.hero, published.profile);
  const snapshot = mergeSnapshot(fallback.snapshot, published.curriculumTotals);
  const curriculum = mergeCurriculum(
    fallback.curriculumPreview,
    published.curriculumCourses,
    published.curriculumTotals,
  );
  const faqs = mergeFaqs(published.faqs);
  const dates = mergeDates(published.dates);
  const contact = mergeContact(published.profile);
  const sources = [hero.source, snapshot.source, curriculum.source, faqs.source, dates.source, contact.source];

  return {
    source: pageSource(sources),
    hero: hero.value,
    snapshot: snapshot.value,
    learningThemes: fallback.learningThemes,
    journey: fallback.journey,
    curriculumPreview: curriculum.value,
    practice: fallback.practice,
    careers: fallback.careers,
    stories: fallback.stories,
    faqs: faqs.value,
    importantDates: dates.value,
    contact: contact.value,
    sectionSources: {
      hero: hero.source,
      snapshot: snapshot.source,
      curriculum: curriculum.source,
      faqs: faqs.source,
      dates: dates.source,
      contact: contact.source,
    },
  };
}
