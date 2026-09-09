"use client";

import { useEffect, useState } from "react";
import { TelegramStatus } from "./telegram-status";
import { telegramApi } from "./telegram-client";
import {
  isSafeTelegramMiniAppPath,
  TELEGRAM_PENDING_STARTAPP_KEY,
  telegramStartAppToken,
} from "./deep-link-launch";

export function TelegramDeepLinkGate() {
  const [resolving, setResolving] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolveLaunch() {
      const stored = sessionStorage.getItem(TELEGRAM_PENDING_STARTAPP_KEY);
      const token = telegramStartAppToken(window.location.search, stored);
      if (!token) {
        if (!cancelled) setResolving(false);
        return;
      }

      sessionStorage.setItem(TELEGRAM_PENDING_STARTAPP_KEY, token);
      try {
        const result = await telegramApi<{ path: string }>("/api/telegram/mini/deep-links/resolve", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (!isSafeTelegramMiniAppPath(result.path)) throw new Error("Deep link resolved to an unsafe path");
        sessionStorage.removeItem(TELEGRAM_PENDING_STARTAPP_KEY);
        window.location.replace(result.path);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        // Keep the pending token while the user completes first-time PMS linking.
        // Invalid/expired signed links are discarded so the Mini App can open home.
        if (!message.includes("not linked") && !message.includes("Open this page from")) {
          sessionStorage.removeItem(TELEGRAM_PENDING_STARTAPP_KEY);
        }
        if (!cancelled) setResolving(false);
      }
    }

    void resolveLaunch();
    return () => { cancelled = true; };
  }, []);

  if (resolving) {
    return <p className="py-10 text-center text-sm text-slate-500">Opening DSE PMS…</p>;
  }
  return <TelegramStatus />;
}
