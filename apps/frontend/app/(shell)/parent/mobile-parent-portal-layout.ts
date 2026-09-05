export const MOBILE_PARENT_PORTAL_LAYOUT = {
  page: "mx-auto w-full min-w-0 max-w-6xl space-y-4 overflow-y-auto px-3 py-4 pb-10 sm:space-y-6 sm:p-6",
  statePage: "mx-auto flex min-h-[55vh] w-full min-w-0 items-center justify-center p-4 sm:p-6",
  hero: "min-w-0 rounded-2xl bg-primary p-4 text-primary-foreground shadow-sm sm:p-6",
  heroContent: "mt-2 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
  heroIdentity: "min-w-0",
  selectorLabel: "block w-full min-w-0 text-sm font-medium sm:w-auto",
  selector:
    "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-primary-foreground/25 bg-background px-3 py-2 text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:min-w-60",
  card: "min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5",
  factRow:
    "flex min-w-0 flex-col gap-1 border-b border-border/60 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
  factValue: "min-w-0 break-words font-medium sm:text-right",
  attendanceHeader:
    "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
  attendanceMetricGrid: "mt-4 grid grid-cols-2 gap-2 text-sm sm:mt-5 sm:grid-cols-3 sm:gap-3",
  attendanceMetric: "min-w-0 rounded-xl bg-muted/40 p-3",
  warning: "flex min-w-0 gap-3 rounded-xl border border-status-upcoming bg-status-upcoming-bg p-3 text-sm text-status-upcoming",
  resultRow:
    "flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4",
  resultText: "min-w-0 break-words",
  resultGrade: "shrink-0 self-start text-lg font-semibold sm:self-auto",
  wrap: "min-w-0 break-words",
} as const;
