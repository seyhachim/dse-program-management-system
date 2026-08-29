import { useEffect, useState } from "react";
import type {
  ChangePasswordInput,
  CreateAccountInput,
  MeResponse,
  ResendInvitationResponse,
  TemporaryPasswordResponse,
} from "@dse-pms/shared-types";
import { api } from "./api";
import { AUTH_MODE, getSupabase } from "./supabase";

/** Auth plugin calls. Privileged recovery still goes through the backend. */
export const authApi = {
  me(): Promise<MeResponse> {
    return api.get<MeResponse>("/api/auth/me");
  },
  createAccount(input: CreateAccountInput): Promise<MeResponse> {
    return api.post<MeResponse>("/api/auth/accounts", input);
  },
  resendInvitation(userId: string): Promise<ResendInvitationResponse> {
    return api.post<ResendInvitationResponse>(
      `/api/auth/accounts/${userId}/resend-invitation`,
      {},
    );
  },
  setTemporaryPassword(userId: string): Promise<TemporaryPasswordResponse> {
    return api.post<TemporaryPasswordResponse>(
      `/api/auth/accounts/${userId}/temporary-password`,
      {},
    );
  },
  changePassword(input: ChangePasswordInput): Promise<MeResponse> {
    return api.post<MeResponse>("/api/auth/change-password", input);
  },
};

/**
 * Cached in-flight `/me` request, shared across all `useMe()` callers so the
 * sidebar, the page guard and the topbar don't each fire their own request.
 */
let mePromise: Promise<MeResponse> | null = null;
const meListeners = new Set<() => void>();
const authIdentityListeners = new Set<(userId: string | undefined) => void>();

function fetchMe(): Promise<MeResponse> {
  if (!mePromise) mePromise = authApi.me();
  return mePromise;
}

/** Drop the cached `/me` result and tell every mounted `useMe()` to refetch. */
export function invalidateMe() {
  mePromise = null;
  meListeners.forEach((listener) => listener());
}

/**
 * Subscribe to Supabase identity changes. Protected application caches use this
 * signal to evict prior-user data on logout or account switching.
 */
export function subscribeAuthIdentityChange(
  listener: (userId: string | undefined) => void,
): () => void {
  authIdentityListeners.add(listener);
  return () => authIdentityListeners.delete(listener);
}

if (AUTH_MODE === "supabase" && typeof window !== "undefined") {
  let lastUserId: string | undefined;
  getSupabase().auth.onAuthStateChange((_event, session) => {
    const userId = session?.user.id;
    if (userId === lastUserId) return;
    lastUserId = userId;
    authIdentityListeners.forEach((listener) => listener(userId));
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
