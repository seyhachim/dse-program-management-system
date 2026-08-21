import type { TelegramInitDataVerifyResponse } from "@dse-pms/shared-types";
import { API_URL } from "../../lib/api";

const SESSION_KEY = "dse.telegram.session";
const SESSION_EXPIRY_KEY = "dse.telegram.session.expires";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready(): void;
        expand(): void;
      };
    };
  }
}

export function saveTelegramSession(token: string, expiresAt?: string) {
  sessionStorage.setItem(SESSION_KEY, token);
  if (expiresAt) sessionStorage.setItem(SESSION_EXPIRY_KEY, expiresAt);
}

export function clearTelegramSession() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_EXPIRY_KEY);
}

export function getCachedTelegramSession(): string | null {
  const token = sessionStorage.getItem(SESSION_KEY);
  const expiresAt = sessionStorage.getItem(SESSION_EXPIRY_KEY);
  if (!token) return null;
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    clearTelegramSession();
    return null;
  }
  return token;
}

export async function getTelegramSession(): Promise<string> {
  const cached = getCachedTelegramSession();
  if (cached) return cached;

  const webApp = window.Telegram?.WebApp;
  webApp?.ready();
  webApp?.expand();
  const initData = webApp?.initData ?? "";
  if (!initData) throw new Error("Open this page from the official DSE Telegram Mini App");

  const response = await fetch(`${API_URL}/api/telegram/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  if (!response.ok) throw new Error("Could not verify this Telegram launch");
  const verified = await response.json() as TelegramInitDataVerifyResponse;
  if (!verified.linked || !verified.sessionToken) {
    throw new Error("This Telegram account is not linked to a PMS account yet");
  }
  saveTelegramSession(verified.sessionToken, verified.sessionExpiresAt);
  return verified.sessionToken;
}

export async function telegramApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getTelegramSession();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (response.status === 401) clearTelegramSession();
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string | { message?: string } } | null;
    const message = typeof payload?.error === "string" ? payload.error : payload?.error?.message;
    throw new Error(message ?? "Telegram Mini App request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
