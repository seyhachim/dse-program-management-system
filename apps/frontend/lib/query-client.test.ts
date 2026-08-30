import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  QUERY_STALE_MS,
  clearProtectedQueryCache,
  createAppQueryClient,
  invalidateProtectedQueryResources,
  isProtectedResourceQueryKey,
  protectedQueryKey,
} from "./query-client";

describe("protected query cache", () => {
  test("separates users and programme scopes in query keys", () => {
    const dse = protectedQueryKey(
      { userId: "user-1", programmeId: "dse" },
      "courses",
      "list",
    );
    const anotherProgramme = protectedQueryKey(
      { userId: "user-1", programmeId: "another" },
      "courses",
      "list",
    );
    const anotherUser = protectedQueryKey(
      { userId: "user-2", programmeId: "dse" },
      "courses",
      "list",
    );

    expect(dse).not.toEqual(anotherProgramme);
    expect(dse).not.toEqual(anotherUser);
    expect(dse).toEqual([
      "protected",
      "user",
      "user-1",
      "programme",
      "dse",
      "courses",
      "list",
    ]);
  });

  test("clears protected data without deleting unrelated public cache", () => {
    const client = new QueryClient();
    const protectedKey = protectedQueryKey(
      { userId: "user-1", programmeId: "dse" },
      "courses",
      "list",
    );
    const publicKey = ["public", "programme-information", "dse"] as const;

    client.setQueryData(protectedKey, [{ id: "course-1" }]);
    client.setQueryData(publicKey, { title: "DSE" });

    clearProtectedQueryCache(client);

    expect(client.getQueryData(protectedKey)).toBeUndefined();
    const publicData = client.getQueryData<{ title: string }>(publicKey);
    expect(publicData?.title).toBe("DSE");
  });

  test("reuses completed fresh GET data and refetches after invalidation", async () => {
    const client = createAppQueryClient();
    const key = protectedQueryKey(
      { userId: "user-1" },
      "courses",
      "list",
    );
    let calls = 0;
    const options = {
      queryKey: key,
      queryFn: async () => {
        calls += 1;
        return { calls };
      },
      staleTime: QUERY_STALE_MS.reference,
    };

    const first = await client.fetchQuery(options);
    const cached = await client.fetchQuery(options);
    expect(first.calls).toBe(1);
    expect(cached.calls).toBe(1);
    expect(calls).toBe(1);

    await client.invalidateQueries({ queryKey: key });
    const refetched = await client.fetchQuery(options);
    expect(refetched.calls).toBe(2);
    expect(calls).toBe(2);
  });

  test("defines explicit freshness classes without persistent storage", () => {
    expect(QUERY_STALE_MS.reference).toBe(300_000);
    expect(QUERY_STALE_MS.operational).toBe(45_000);
    expect(QUERY_STALE_MS.draft).toBe(10_000);
    expect(QUERY_STALE_MS.review).toBe(5_000);
    expect(QUERY_STALE_MS.immutable).toBe(Number.POSITIVE_INFINITY);
  });

  test("matches only the canonical protected resource segment", () => {
    const qa = protectedQueryKey(
      { userId: "user-1", programmeId: "dse" },
      "qa",
      "live",
    );
    const release = protectedQueryKey(
      { userId: "user-1", programmeId: "dse" },
      "qa-release",
      "release-1",
    );

    expect(isProtectedResourceQueryKey(qa, ["qa"])).toBe(true);
    expect(isProtectedResourceQueryKey(release, ["qa"])).toBe(false);
    expect(isProtectedResourceQueryKey(["public", "qa"], ["qa"])).toBe(false);
  });

  test("invalidates selected mutable resources without touching immutable siblings", async () => {
    const client = createAppQueryClient();
    const studentsKey = protectedQueryKey(
      { userId: "user-1", programmeId: "dse" },
      "students",
      "list",
    );
    const dashboardKey = protectedQueryKey(
      { userId: "user-1", programmeId: "dse" },
      "dashboard",
      "summary",
    );
    const releaseKey = protectedQueryKey(
      { userId: "user-1", programmeId: "dse" },
      "qa-release",
      "release-1",
    );

    client.setQueryData(studentsKey, [{ id: "student-1" }]);
    client.setQueryData(dashboardKey, { students: 1 });
    client.setQueryData(releaseKey, { id: "release-1" });

    await invalidateProtectedQueryResources(client, ["students", "dashboard"]);

    expect(client.getQueryState(studentsKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(dashboardKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(releaseKey)?.isInvalidated).toBe(false);
  });

  test("does not cross-match another mutable resource", async () => {
    const client = createAppQueryClient();
    const studentsKey = protectedQueryKey({ userId: "user-1" }, "students", "list");
    const coursesKey = protectedQueryKey({ userId: "user-1" }, "courses", "list");

    client.setQueryData(studentsKey, []);
    client.setQueryData(coursesKey, []);

    await invalidateProtectedQueryResources(client, ["students"]);

    expect(client.getQueryState(studentsKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(coursesKey)?.isInvalidated).toBe(false);
  });
});
