import type { ReactNode } from "react";

export default function TelegramLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </main>
  );
}
