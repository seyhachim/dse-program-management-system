import { TelegramStatus } from "./telegram-status";

export default function TelegramMiniAppPage() {
  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <p className="text-sm font-medium text-slate-500">DSE PMS</p>
        <h1 className="text-2xl font-semibold tracking-tight">Telegram Mini App</h1>
        <p className="text-sm text-slate-600">
          Secure mobile access to high-frequency student and lecturer workflows.
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <TelegramStatus />
      </div>

      <p className="text-xs leading-5 text-slate-500">
        Telegram launches are verified server-side. PMS identity, enrolment, roles, result publication, survey, and attendance permissions are re-checked by the PMS backend on every protected request.
      </p>
    </section>
  );
}
