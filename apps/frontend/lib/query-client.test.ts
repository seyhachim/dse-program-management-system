import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  QUERY_STALE_MS,
  clearProtectedQueryCache,
  createAppQueryClient,
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
});
