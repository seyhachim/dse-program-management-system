import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { QUERY_STALE_MS } from "./query-client";
import {
  prefetchRouteData,
  protectedRoutePrefetchPlan,
  type RoutePrefetchQuery,
} from "./route-prefetch";

const prefix = [
  "protected",
  "user",
  "user-1",
  "programme",
  "*",
] as const;

describe("protected route prefetch plans", () => {
  test("students prefetches the exact first cursor-page key", () => {
    const plan = protectedRoutePrefetchPlan({
      userId: "user-1",
      roles: ["admin"],
      path: "/students",
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.queryKey).toEqual([
      ...prefix,
      "students",
      "page",
      "",
      false,
      "first",
      50,
    ]);
    expect(plan[0]?.staleTime).toBe(QUERY_STALE_MS.operational);
  });

  test("offerings prefetches only the initial offering list, not roster reference data", () => {
    const plan = protectedRoutePrefetchPlan({
      userId: "user-1",
      roles: ["program_coordinator"],
      path: "/offerings",
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.queryKey).toEqual([...prefix, "offerings", "list"]);
    expect(JSON.stringify(plan.map((query) => query.queryKey))).not.toContain(
      "offering-roster-reference",
    );
  });

  test("programme-wide courses prefetches only the initial course list", () => {
    const plan = protectedRoutePrefetchPlan({
      userId: "user-1",
      roles: ["admin"],
      path: "/courses",
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.queryKey).toEqual([...prefix, "courses", "list", ""]);
    expect(plan[0]?.staleTime).toBe(QUERY_STALE_MS.operational);
  });

  test("lecturer course specifications prefetches the four reads that gate the table", () => {
    const plan = protectedRoutePrefetchPlan({
      userId: "user-1",
      roles: ["lecturer"],
      path: "/courses",
    });

    expect(plan.map((query) => query.queryKey)).toEqual([
      [...prefix, "courses", "list"],
      [...prefix, "offerings", "list"],
      [...prefix, "courses", "spec-progress"],
      [...prefix, "courses", "section-presence"],
    ]);
    expect(plan.map((query) => query.staleTime)).toEqual([
      QUERY_STALE_MS.reference,
      QUERY_STALE_MS.operational,
      QUERY_STALE_MS.review,
      QUERY_STALE_MS.operational,
    ]);
  });

  test("programme-wide role wins when a user also has lecturer", () => {
    const plan = protectedRoutePrefetchPlan({
      userId: "user-1",
      roles: ["lecturer", "program_coordinator"],
      path: "/courses",
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.queryKey).toEqual([...prefix, "courses", "list", ""]);
  });

  test("unsupported and heavy routes do not trigger protected data prefetch", () => {
    expect(
      protectedRoutePrefetchPlan({
        userId: "user-1",
        roles: ["admin"],
        path: "/aun-qa/sar-preview",
      }),
    ).toEqual([]);
  });

  test("repeated intent reuses a fresh query instead of issuing duplicate work", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let calls = 0;
    const plan: RoutePrefetchQuery[] = [
      {
        queryKey: ["protected", "prefetch-test"],
        queryFn: async () => {
          calls += 1;
          return { ok: true };
        },
        staleTime: 60_000,
      },
    ];

    await prefetchRouteData(queryClient, plan);
    await prefetchRouteData(queryClient, plan);

    expect(calls).toBe(1);
  });
});
