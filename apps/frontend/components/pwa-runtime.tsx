"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share2, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

const INSTALL_DISMISSED_KEY = "dse-pms:pwa-install-dismissed";

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function isIosLike(): boolean {
  const nav = navigator;
  return /iPad|iPhone|iPod/i.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
}

function wasDismissedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.sessionStorage.setItem(INSTALL_DISMISSED_KEY, "1");
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

/**
 * Registers the deliberately conservative service worker and exposes a small,
 * dismissible install affordance when the browser says installation is useful.
 * Telegram keeps its own thin companion UX, so the install prompt is suppressed
 * inside Telegram Mini App routes to avoid presenting two competing app choices.
 */
export function PwaRuntime() {
  const pathname = usePathname();
  const suppressPwaUi = pathname.startsWith("/telegram") || pathname === "/offline";
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (suppressPwaUi || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then((registration) => registration.update())
      .catch(() => undefined);
  }, [suppressPwaUi]);

  useEffect(() => {
    if (suppressPwaUi || isStandalone() || wasDismissedThisSession()) return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setShowIosInstall(false);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowIosInstall(false);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    if (isIosLike()) setShowIosInstall(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [suppressPwaUi]);

  const dismiss = () => {
    rememberDismissal();
    setInstallPrompt(null);
    setShowIosInstall(false);
    setShowIosHelp(false);
  };

  const install = async () => {
    if (!installPrompt) return;

    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      // Browser install prompts are single-use. If the user declines, let the
      // browser decide when to offer installation again on a later session.
      setInstallPrompt(null);
    }
  };

  if (suppressPwaUi || (!installPrompt && !showIosInstall)) return null;

  return (
    <aside
      aria-label="Install DSE PMS"
      className="fixed bottom-4 left-4 right-4 z-[80] mx-auto max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg sm:left-auto sm:mx-0 sm:w-[360px]"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Download className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Install DSE PMS</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Add the same DSE PMS to your home screen for faster mobile access.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Dismiss install suggestion"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {installPrompt ? (
        <button
          type="button"
          onClick={install}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <Download className="size-4" aria-hidden="true" />
          Install app
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowIosHelp((current) => !current)}
            aria-expanded={showIosHelp}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Share2 className="size-4" aria-hidden="true" />
            How to install
          </button>
          {showIosHelp ? (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              In Safari, tap Share, then choose <strong className="font-semibold text-foreground">Add to Home Screen</strong>.
            </p>
          ) : null}
        </>
      )}
    </aside>
  );
}
