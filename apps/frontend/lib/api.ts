/**
 * Thin fetch wrapper around the backend API. This is the single place the bearer
 * token is attached. In `AUTH_MODE=supabase` the token is the live Supabase
 * session access token; in `dev` it falls back to the static NEXT_PUBLIC_DEV_TOKEN
 * minted by `bun run gen-token`.
 */
import { createInflightGetDeduper } from "./inflight-get";
import { AUTH_MODE, getSupabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DEV_TOKEN = process.env.NEXT_PUBLIC_DEV_TOKEN ?? "";
const runInflightGet = createInflightGetDeduper();

async function authHeader(): Promise<Record<string, string>> {
  if (AUTH_MODE === "supabase") {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  return DEV_TOKEN ? { Authorization: `Bearer ${DEV_TOKEN}` } : {};
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeader()),
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (res.status === 401 && AUTH_MODE === "supabase" && !isRetry) {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session) return request<T>(path, init, true);
    await supabase.auth.signOut();
    window.location.replace("/login");
    throw new ApiError(401, "Session expired. Please sign in again.");
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json() as unknown;
      message = errorMessage(body, message);
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => runInflightGet(path, () => request<T>(path)),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
};

export { API_URL };
