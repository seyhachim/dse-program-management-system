"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { subscribeAuthIdentityChange } from "@/lib/auth";
import {
  clearProtectedQueryCache,
  createAppQueryClient,
} from "@/lib/query-client";

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);

  useEffect(
    () =>
      subscribeAuthIdentityChange(() => {
        clearProtectedQueryCache(queryClient);
      }),
    [queryClient],
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
