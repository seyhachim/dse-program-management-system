import { protectedQueryKey, QUERY_STALE_MS } from "./query-client";

export const COURSE_SPEC_QUERY_GC_MS = 60 * 60_000;

export function courseSpecCoreQueryKey(userId: string, courseId: string) {
  return protectedQueryKey(
    { userId },
    "course-spec",
    courseId,
    "core",
  );
}

export function courseSpecAuthoringQueryKey(userId: string, courseId: string) {
  return protectedQueryKey(
    { userId },
    "course-spec",
    courseId,
    "authoring",
  );
}

export function courseSpecHistoryQueryKey(userId: string, courseId: string) {
  return protectedQueryKey(
    { userId },
    "course-spec",
    courseId,
    "history",
  );
}

export const COURSE_SPEC_STALE_MS = {
  draft: QUERY_STALE_MS.draft,
  history: QUERY_STALE_MS.operational,
} as const;
