import { useEffect, useState } from "react";
import type { CreateAccountInput, MeResponse } from "@dse-pms/shared-types";
import { api } from "./api";
import { AUTH_MODE, getSupabase } from "./supabase";

/**
 * Auth plugin calls. `me` resolves the current caller (email + role, from the
 * backend's `User` row). `createAccount` provisions an invited account;
 * `resendInvitation` rotates only a still-pending lecturer invitation.
 */
export const authApi = {
  me(): Promise<MeResponse> {
    return api.get<MeResponse>("/api/auth/me");
  },
  createAccount(input: CreateAccountInput): Promise<MeResponse> {
    return api.post<MeResponse>("/api/auth/accounts", input);
  },
  resendInvitation(userId: string): Promise<{ email: string }> {
    return api.post<{ email: string }>(`/api/auth/accounts/${userId}/resend-invitation`, {});
  },
};

/**
 * Cached in-flight `/me` request, shared across all `useMe()` callers so the
 * sidebar, the page guard and the topbar don't each fire their own request.
 * Invalidated below whenever the Supabase session changes so switching accounts
 * doesn't leave every consumer showing the previous user's role until a full
 * page refresh reloads this module.
 */
let mePromise: Promise<MeResponse> | null = null;
const meListeners = new Set<() => void>();

function fetchMe(): Promise<MeResponse> {
  if (!mePromise) mePromise = authApi.me();
  return mePromise;
}

/** Drop the cached `/me` result and tell every mounted `useMe()` to refetch. */
export function invalidateMe() {
  mePromise = null;
  meListeners.forEach((listener) => listener());
}

if (AUTH_MODE === "supabase" && typeof window !== "undefined") {
  // A different user signing in (or out) makes the cached `/me` response stale —
  // without this, `useMe()` keeps returning the previous account's role until a
  // full page refresh reloads this module. Guarded to the browser since this
  // module is also pulled into the server render pass of client components.
  let lastUserId: string | undefined;
  getSupabase().auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id;
    if (userId === lastUserId) return;
    lastUserId = userId;
    invalidateMe();
  });
}

/** Resolved current caller, or `null` while loading / on error. */
export function useMe(): { me: MeResponse | null; loading: boolean } {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => {
      setLoading(true);
      fetchMe()
        .then((res) => active && setMe(res))
        .catch(() => active && setMe(null))
        .finally(() => active && setLoading(false));
    };
    load();
    meListeners.add(load);
    return () => {
      active = false;
      meListeners.delete(load);
    };
  }, []);

  return { me, loading };
}
