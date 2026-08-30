import { getQueryUxState } from "@/lib/query-ux-state";

export function QueryRefreshStatus({
  hasData,
  isPending,
  isFetching,
  isError,
  label,
}: {
  hasData: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  label: string;
}) {
  const state = getQueryUxState({ hasData, isPending, isFetching, isError });

  if (state === "refresh-error") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming"
      >
        {label} refresh failed — showing the last available data.
      </div>
    );
  }

  if (state === "refreshing") {
    return (
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        Refreshing {label.toLocaleLowerCase()}…
      </p>
    );
  }

  return null;
}
