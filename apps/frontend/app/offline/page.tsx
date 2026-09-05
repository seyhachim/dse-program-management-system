import { RefreshCw, WifiOff } from "lucide-react";

/**
 * Data-free fallback rendered only when a navigation cannot reach the network.
 * Protected academic data is intentionally not cached for offline display.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <WifiOff className="size-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">You&apos;re offline</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          DSE PMS needs a connection to load current protected academic data. We do not present cached grades,
          attendance, permissions, or other protected records as if they are current.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </a>
      </section>
    </main>
  );
}
