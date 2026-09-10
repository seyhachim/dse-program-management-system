export const LECTURER_OVERVIEW_LAYOUT = {
  main: "flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6",
  content: "mx-auto max-w-7xl space-y-4 sm:space-y-6",
  mobileHero:
    "relative overflow-hidden rounded-[2rem] bg-primary px-5 py-5 text-primary-foreground shadow-md sm:px-6 sm:py-6 md:hidden",
  mobilePeriodField:
    "block rounded-2xl bg-primary-foreground/10 p-3 ring-1 ring-primary-foreground/15",
  mobilePeriodSelect:
    "mt-2 h-11 w-full rounded-xl border border-primary-foreground/20 bg-background px-3 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary-foreground/70",
  intro:
    "hidden gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5 md:flex md:flex-row md:items-end md:justify-between",
  periodField: "flex w-full flex-col gap-2 text-sm sm:w-60",
  periodSelect:
    "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:h-9",
  summaryGrid: "grid grid-cols-2 gap-3 xl:grid-cols-5",
  summaryCard:
    "min-h-24 rounded-[1.5rem] border border-border/70 bg-card p-4 shadow-sm sm:min-h-0 md:rounded-xl md:border-border",
  summaryFinalCard: "col-span-2 xl:col-span-1",
  assignmentSurface:
    "overflow-hidden rounded-[1.75rem] border border-border/70 bg-card shadow-sm md:rounded-xl md:border-border",
  assignmentHeader: "border-b border-border px-4 py-4 sm:px-5",
  mobileAssignments: "divide-y divide-border md:hidden",
  desktopAssignments: "hidden overflow-x-auto md:block",
} as const;
