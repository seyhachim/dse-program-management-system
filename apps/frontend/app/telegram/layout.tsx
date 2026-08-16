import type { ReactNode } from "react";
import Script from "next/script";

export default function TelegramLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <div className="mx-auto w-full max-w-md">{children}</div>
    </main>
  );
}
