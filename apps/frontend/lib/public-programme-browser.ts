import type {
  PublicProgrammeFaq,
  PublicProgrammeImportantDate,
  PublicProgrammeProfile,
} from "@dse-pms/shared-types";
import { publicProgrammeContent } from "./public-programme";
import {
  mergePublicProgrammePage,
  type PublishedResult,
  type PublicCurriculumCourseDto,
  type PublicCurriculumTotalsDto,
  type PublicProgrammePageModel,
} from "./public-programme-page";

const DEFAULT_PROGRAMME_ID = "dse";

async function getPublished<T>(path: string): Promise<PublishedResult<T>> {
  try {
    const response = await fetch(path, {
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });

    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "unavailable" };

    return {
      kind: "available",
      value: (await response.json()) as T,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

export function createPublicProgrammeFallback(): PublicProgrammePageModel {
  const unavailable = { kind: "unavailable" } as const;

  return mergePublicProgrammePage(publicProgrammeContent, {
    profile: unavailable,
    faqs: unavailable,
    dates: unavailable,
    curriculumCourses: unavailable,
    curriculumTotals: unavailable,
  });
}

export async function loadPublicProgrammePageFromBrowser(
  programmeId = DEFAULT_PROGRAMME_ID,
): Promise<PublicProgrammePageModel> {
  const base = `/api/programme/public/programmes/${encodeURIComponent(programmeId)}`;

  const [profile, faqs, dates, curriculumCourses, curriculumTotals] = await Promise.all([
    getPublished<PublicProgrammeProfile>(base),
    getPublished<PublicProgrammeFaq[]>(`${base}/faqs`),
    getPublished<PublicProgrammeImportantDate[]>(`${base}/important-dates`),
    getPublished<PublicCurriculumCourseDto[]>(`${base}/curriculum/courses`),
    getPublished<PublicCurriculumTotalsDto>(`${base}/curriculum/totals`),
  ]);

  return mergePublicProgrammePage(publicProgrammeContent, {
    profile,
    faqs,
    dates,
    curriculumCourses,
    curriculumTotals,
  });
}
