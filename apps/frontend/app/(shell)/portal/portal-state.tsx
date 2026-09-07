"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { protectedQueryKey, QUERY_STALE_MS } from "@/lib/query-client";

function portalErrorMessage(reason: unknown): string {
  return reason instanceof ApiError
    ? reason.message
    : "Could not load student portal";
}

export function usePortalData<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loader()
      .then((value) => active && setData(value))
      .catch((reason) => active && setError(portalErrorMessage(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loader]);
  return { data, loading, error, setData };
}

/**
 * Authenticated student-portal GETs that benefit from in-session reuse should
 * use this helper instead of persisting responses in browser or service-worker
 * storage. The canonical protected key keeps values isolated by PMS user.
 */
export function useCachedPortalData<T>(
  resource: string,
  loader: () => Promise<T>,
  parts: readonly (string | number | boolean | null)[] = [],
  staleTime: number = QUERY_STALE_MS.operational,
) {
  const { me, loading: meLoading } = useMe();
  const queryClient = useQueryClient();
  const scope = { userId: me?.id ?? "pending" };
  const queryKey = protectedQueryKey(scope, `student-portal-${resource}`, ...parts);
  const query = useQuery({
    queryKey,
    queryFn: loader,
    enabled: Boolean(me?.id),
    staleTime,
  });
  const data = query.data ?? null;

  const setData = (value: T) => {
    queryClient.setQueryData(queryKey, value);
  };

  return {
    data,
    loading: meLoading || (!data && query.isPending),
    error: !data && query.isError ? portalErrorMessage(query.error) : null,
    refreshError: data && query.isError ? portalErrorMessage(query.error) : null,
    refreshing: Boolean(data && query.isFetching),
    setData,
  };
}

export function usePortalPrefetch(
  entries: readonly {
    resource: string;
    loader: () => Promise<unknown>;
    staleTime?: number;
  }[],
  enabled = true,
) {
  const { me } = useMe();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !me?.id) return;
    const scope = { userId: me.id };
    for (const entry of entries) {
      void queryClient.prefetchQuery({
        queryKey: protectedQueryKey(
          scope,
          `student-portal-${entry.resource}`,
        ),
        queryFn: entry.loader,
        staleTime: entry.staleTime ?? QUERY_STALE_MS.operational,
      });
    }
  }, [enabled, entries, me?.id, queryClient]);
}

export function PortalLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

export function PortalError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-status-upcoming bg-status-upcoming-bg p-4 text-sm text-status-upcoming">
      <AlertCircle className="h-5 w-5" />
      {message}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
