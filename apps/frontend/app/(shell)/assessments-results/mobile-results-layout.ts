export const MOBILE_RESULTS_LAYOUT = {
  main: "flex-1 overflow-y-auto p-3 sm:p-4 md:p-6",
  selector:
    "mt-1 block h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring sm:min-w-72 md:h-10",
  refresh: "h-11 w-full sm:w-auto md:h-10",
  metrics: "grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-5",
  metricCard: "rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4",
  finalMetric: "col-span-2 xl:col-span-1",
  mobileRows: "divide-y divide-border md:hidden",
  mobileRow: "space-y-4 p-4",
  desktopRows: "hidden overflow-x-auto md:block",
  fullWidthPhoneAction: "h-11 w-full sm:w-auto",
} as const;
