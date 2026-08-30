import { Skeleton } from "@dse-pms/ui";

/** Neutral shell chrome only. It intentionally contains no role-sensitive links
 * or protected record data and is safe to show while session/account checks run. */
export function ShellLoadingFrame() {
  return (
    <div
      className="flex h-screen min-h-0 bg-background"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Checking your secure DSE-PMS session…</span>
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card p-4 md:block">
        <Skeleton className="mb-7 h-8 w-36 rounded-lg" />
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
          <Skeleton className="h-8 w-8 rounded-md md:hidden" />
          <Skeleton className="h-5 w-44 rounded-md" />
          <Skeleton className="ml-auto h-8 w-24 rounded-md" />
        </header>
        <RouteContentLoading />
      </div>
    </div>
  );
}

/** Protected content placeholder with no route-specific labels or values. */
export function RouteContentLoading() {
  return (
    <main className="flex-1 overflow-hidden p-4 sm:p-6" aria-busy="true">
      <div className="mb-5 space-y-2">
        <Skeleton className="h-7 w-52 rounded-md" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-5 h-64 w-full rounded-xl" />
    </main>
  );
}
