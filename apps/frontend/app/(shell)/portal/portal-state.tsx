"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Skeleton } from "@dse-pms/ui";
import { ApiError } from "@/lib/api";

export function usePortalData<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loader()
      .then((value) => active && setData(value))
      .catch((reason) => active && setError(reason instanceof ApiError ? reason.message : "Could not load student portal"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [loader]);
  return { data, loading, error, setData };
}

export function PortalLoading() {
  return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>;
}

export function PortalError({ message }: { message: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-status-upcoming bg-status-upcoming-bg p-4 text-sm text-status-upcoming"><AlertCircle className="h-5 w-5" />{message}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center"><h3 className="font-semibold text-foreground">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>;
}
