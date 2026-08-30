import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "./api";

export const PROTECTED_QUERY_ROOT = ["protected"] as const;

export const QUERY_STALE_MS = {
  reference: 5 * 60_000,
  operational: 45_000,
  draft: 10_000,
  review: 5_000,
  immutable: Number.POSITIVE_INFINITY,
} as const;

export interface ProtectedQueryScope {
  userId: string;
  programmeId?: string | null;
}

/**
 * Every protected query is keyed by authenticated application user and, when
 * applicable, programme. A programme-scoped response can therefore never reuse
 * another programme's cached value even within the same browser session.
 */
export function protectedQueryKey(
  scope: ProtectedQueryScope,
  resource: string,
  ...parts: readonly (string | number | boolean | null)[]
) {
  return [
    ...PROTECTED_QUERY_ROOT,
    "user",
    scope.userId,
    "programme",
    scope.programmeId ?? "*",
    resource,
    ...parts,
  ] as const;
}

export function clearProtectedQueryCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: PROTECTED_QUERY_ROOT });
}

/**
 * Match only the resource segment of the canonical protected query key. Exact
 * matching is deliberate: invalidating mutable `qa` must not touch a future
 * immutable `qa-release` or `qa-snapshot` cache entry.
 */
export function isProtectedResourceQueryKey(
  queryKey: QueryKey,
  resources: readonly string[],
): boolean {
  if (
    queryKey[0] !== "protected" ||
    queryKey[1] !== "user" ||
    typeof queryKey[2] !== "string" ||
    queryKey[3] !== "programme" ||
    typeof queryKey[4] !== "string" ||
    typeof queryKey[5] !== "string"
  ) {
    return false;
  }
  return resources.includes(queryKey[5]);
}

export function invalidateProtectedQueryResources(
  queryClient: QueryClient,
  resources: readonly string[],
): Promise<void> {
  if (!resources.length) return Promise.resolve();
  return queryClient.invalidateQueries({
    predicate: (query) =>
      isProtectedResourceQueryKey(query.queryKey, resources),
  });
}

function retryProtectedQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

/**
 * In-memory only. Protected responses are deliberately not persisted to local
 * storage/session storage. HTTP transport also remains `cache: no-store` in
 * `api.ts`; freshness is owned explicitly by this application query cache.
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: true,
        retry: retryProtectedQuery,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
