export const MOBILE_ATTENDANCE_LAYOUT = {
  main: "flex-1 overflow-y-auto p-3 sm:p-4 md:p-6",
  content: "mx-auto max-w-7xl space-y-4 md:space-y-6",
  control: "h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring md:h-10",
  summary: "grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-6",
  summaryCard: "rounded-xl border border-border bg-card p-3 shadow-sm sm:p-4",
  mobileRegister: "divide-y divide-border md:hidden",
  mobileStudentCard: "space-y-3 p-4",
  desktopRegister: "hidden overflow-x-auto md:block",
  mobileHistory: "divide-y divide-border md:hidden",
  desktopHistory: "hidden overflow-x-auto md:block",
  primaryAction:
    "inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50 md:h-9 md:w-auto",
  secondaryAction:
    "inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 md:min-h-9",
} as const;
