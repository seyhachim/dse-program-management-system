export const LECTURER_OVERVIEW_LAYOUT = {
  main: "flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6",
  content: "mx-auto max-w-7xl space-y-4 sm:space-y-6",
  intro:
    "flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5 md:flex-row md:items-end md:justify-between",
  periodField: "flex w-full flex-col gap-2 text-sm sm:w-60",
  periodSelect:
    "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:h-9",
  summaryGrid: "grid grid-cols-2 gap-3 xl:grid-cols-5",
  summaryCard:
    "min-h-28 rounded-xl border border-border bg-card p-4 shadow-sm sm:min-h-0",
  summaryFinalCard: "col-span-2 xl:col-span-1",
  mobileAssignments: "divide-y divide-border md:hidden",
  desktopAssignments: "hidden overflow-x-auto md:block",
} as const;
