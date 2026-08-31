import type { OfferingView, Role } from "@dse-pms/shared-types";
import type { QueryKey } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { coursesApi } from "./courses";
import { offeringsApi } from "./offerings";
import { protectedQueryKey, QUERY_STALE_MS } from "./query-client";
import { studentsApi } from "./students";

export interface RoutePrefetchQuery {
  queryKey: QueryKey;
  queryFn: () => Promise<unknown>;
  staleTime: number;
}

const PROGRAMME_WIDE_COURSE_ROLES: readonly Role[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "qa_reviewer",
];
const STUDENT_PAGE_SIZE = 50;

function isLecturerOnlyCourseView(roles: readonly Role[]): boolean {
  return (
    roles.includes("lecturer") &&
    !roles.some((role) => PROGRAMME_WIDE_COURSE_ROLES.includes(role))
  );
}

/**
 * Keep the same list ordering used by the Offerings screen when intent
 * prefetch populates its shared query key before the destination mounts.
 */
function sortOfferingsForPrefetch(offerings: OfferingView[]): OfferingView[] {
  return [...offerings].sort((a, b) => {
    const semesterCompare = String(a.semester ?? "").localeCompare(
      String(b.semester ?? ""),
      undefined,
      { numeric: true },
    );
    if (semesterCompare !== 0) return semesterCompare;

    const yearCompare = String(a.programmeYear ?? "").localeCompare(
      String(b.programmeYear ?? ""),
      undefined,
      { numeric: true },
    );
    if (yearCompare !== 0) return yearCompare;

    const courseCompare = String(a.course?.code ?? "").localeCompare(
      String(b.course?.code ?? ""),
    );
    return courseCompare || a.sectionCode.localeCompare(b.sectionCode);
  });
}

/**
 * Data plans are deliberately limited to small, high-probability protected
 * routes. The caller must already have an authenticated application user; the
 * resulting keys remain user/programme scoped and all API authorization still
 * runs on the backend.
 */
export function protectedRoutePrefetchPlan(input: {
  userId: string;
  roles: readonly Role[];
  path: string;
}): RoutePrefetchQuery[] {
  const scope = { userId: input.userId };

  if (input.path === "/students") {
    return [
      {
        queryKey: protectedQueryKey(
          scope,
          "students",
          "page",
          "",
          false,
          "first",
          STUDENT_PAGE_SIZE,
        ),
        queryFn: () =>
          studentsApi.listPage({ search: "", activeOnly: false, limit: STUDENT_PAGE_SIZE }),
        staleTime: QUERY_STALE_MS.operational,
      },
    ];
  }

  if (input.path === "/offerings") {
    return [
      {
        queryKey: protectedQueryKey(scope, "offerings", "list"),
        queryFn: async () =>
          sortOfferingsForPrefetch(await offeringsApi.list()),
        staleTime: QUERY_STALE_MS.operational,
      },
    ];
  }

  if (input.path === "/courses") {
    if (isLecturerOnlyCourseView(input.roles)) {
      return [
        {
          queryKey: protectedQueryKey(scope, "courses", "list"),
          queryFn: () => coursesApi.list(),
          staleTime: QUERY_STALE_MS.reference,
        },
        {
          queryKey: protectedQueryKey(scope, "offerings", "list"),
          queryFn: async () =>
            sortOfferingsForPrefetch(await offeringsApi.list()),
          staleTime: QUERY_STALE_MS.operational,
        },
        {
          queryKey: protectedQueryKey(scope, "courses", "spec-progress"),
          queryFn: () => coursesApi.specProgress(),
          staleTime: QUERY_STALE_MS.review,
        },
        {
          queryKey: protectedQueryKey(scope, "courses", "section-presence"),
          queryFn: () => coursesApi.sectionPresence(),
          staleTime: QUERY_STALE_MS.operational,
        },
      ];
    }

    return [
      {
        queryKey: protectedQueryKey(scope, "courses", "list", ""),
        queryFn: () => coursesApi.list(""),
        staleTime: QUERY_STALE_MS.operational,
      },
    ];
  }

  return [];
}

/**
 * TanStack Query coalesces an in-flight request and skips a fresh cached query,
 * so repeated hover/focus/touch intent does not create duplicate network work.
 */
export async function prefetchRouteData(
  queryClient: QueryClient,
  plan: readonly RoutePrefetchQuery[],
): Promise<void> {
  await Promise.all(
    plan.map((query) =>
      queryClient.prefetchQuery({
        queryKey: query.queryKey,
        queryFn: query.queryFn,
        staleTime: query.staleTime,
      }),
    ),
  );
}
