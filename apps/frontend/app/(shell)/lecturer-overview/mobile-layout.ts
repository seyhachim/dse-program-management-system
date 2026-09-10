export const LECTURER_OVERVIEW_LAYOUT = {
  main: "flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6",
  content: "mx-auto max-w-7xl space-y-3 sm:space-y-6",
  mobileHero:
    "relative overflow-hidden rounded-[1.75rem] bg-primary px-5 py-4 text-primary-foreground shadow-md sm:px-6 sm:py-5 md:hidden",
  mobileTermField:
    "block rounded-2xl border border-border/70 bg-card px-3 py-3 shadow-sm md:hidden",
  mobileTermSelect:
    "mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-ring",
  intro:
    "hidden gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5 md:flex md:flex-row md:items-end md:justify-between",
  periodField: "flex w-full flex-col gap-2 text-sm sm:w-60",
  periodSelect:
    "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:h-9",
  mobileSummaryGrid: "grid grid-cols-2 gap-2 md:hidden",
  mobileSummaryCard:
    "rounded-2xl border border-border/70 bg-card p-3 shadow-sm",
  summaryGrid: "hidden md:grid md:grid-cols-2 md:gap-3 xl:grid-cols-5",
  summaryCard:
    "rounded-xl border border-border bg-card p-4 shadow-sm",
  summaryFinalCard: "md:col-span-2 xl:col-span-1",
  assignmentSurface:
    "overflow-hidden rounded-[1.5rem] border border-border/70 bg-card shadow-sm md:rounded-xl md:border-border",
  assignmentHeader: "border-b border-border px-4 py-3 sm:px-5 sm:py-4",
  mobileAssignments: "divide-y divide-border/70 md:hidden",
  desktopAssignments: "hidden overflow-x-auto md:block",
} as const;
