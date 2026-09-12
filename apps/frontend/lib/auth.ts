import { useEffect, useState } from "react";
import type {
  ChangePasswordInput,
  CreateAccountInput,
  MeResponse,
  ResendInvitationResponse,
  TemporaryPasswordResponse,
} from "@dse-pms/shared-types";
import { api } from "./api";
import { createAuthMeCache } from "./auth-me-cache";
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
  resendStudentInvitation(studentId: string): Promise<ResendInvitationResponse> {
    return api.post<ResendInvitationResponse>(
      `/api/auth/students/${studentId}/resend-invitation`,
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
 * Successful `/me` results are shared across mounted callers until the auth
 * identity changes. Failed lookups are deliberately evicted so retry is real.
 */
const meCache = createAuthMeCache(() => authApi.me());
const meListeners = new Set<() => void>();
const authIdentityListeners = new Set<(userId: string | undefined) => void>();

function fetchMe(): Promise<MeResponse> {
  return meCache.get();
}

/** Drop the cached `/me` result and tell every mounted `useMe()` to refetch. */
export function invalidateMe() {
  meCache.clear();
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

export type UseMeResult = {
  me: MeResponse | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
};

/** Resolved current caller, with an explicit recoverable load-error state. */
export function useMe(): UseMeResult {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      setLoading(true);
      setError(null);
      fetchMe()
        .then((res) => {
          if (!active) return;
          setMe(res);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setMe(null);
          setError(cause instanceof Error ? cause : new Error("Account verification failed"));
        })
        .finally(() => active && setLoading(false));
    };
    load();
    meListeners.add(load);
    return () => {
      active = false;
      meListeners.delete(load);
    };
  }, []);

  return { me, loading, error, retry: invalidateMe };
}
