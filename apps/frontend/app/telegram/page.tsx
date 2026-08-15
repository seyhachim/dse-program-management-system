import { TelegramStatus } from "./telegram-status";

export default function TelegramMiniAppPage() {
  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">DSE PMS</p>
        <h1 className="text-2xl font-semibold tracking-tight">Telegram Mini App</h1>
        <p className="text-sm text-slate-600">
          Lightweight mobile access to the Program Management System.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <TelegramStatus />
      </div>

      <p className="text-xs leading-5 text-slate-500">
        This foundation does not authenticate Telegram users or expose student or lecturer data.
      </p>
    </section>
  );
}
