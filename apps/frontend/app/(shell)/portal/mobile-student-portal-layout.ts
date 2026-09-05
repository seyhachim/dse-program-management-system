export const MOBILE_STUDENT_PORTAL_LAYOUT = {
  homeStack: "space-y-4 md:space-y-6",
  hero: "rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-4 text-primary-foreground shadow-sm sm:p-6",
  compactCard: "rounded-2xl border border-border bg-card p-4 md:p-5",
  courseCard:
    "group flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-md md:min-h-64 md:p-5 md:hover:-translate-y-0.5",
  scheduleSection: "grid gap-2 md:grid-cols-[130px_minmax(0,1fr)] md:gap-3",
  scheduleMeeting:
    "grid min-w-0 gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 sm:grid-cols-[110px_minmax(0,1fr)_auto]",
  resultMetrics: "grid grid-cols-2 gap-2 sm:gap-3",
  resultMetricCard:
    "flex min-w-0 items-center gap-2 rounded-xl border border-border px-3 py-2 sm:gap-3",
  resultAchievementGrid: "mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4",
  timeline:
    "relative space-y-1 sm:ml-2 sm:before:absolute sm:before:bottom-4 sm:before:left-[7.5rem] sm:before:top-4 sm:before:w-px sm:before:bg-border",
  timelineRow:
    "relative grid grid-cols-1 gap-2 py-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4",
  timelineDate: "text-left sm:text-right",
  timelineDot:
    "absolute -left-[1.3rem] top-4 hidden h-2.5 w-2.5 rounded-full ring-4 ring-background sm:block",
  periodFact:
    "flex flex-col gap-1 border-b border-border/70 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
  periodFactLast:
    "flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
  touchAction:
    "inline-flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-medium sm:w-auto",
  announcementCard: "rounded-2xl border border-border bg-card p-4 md:p-5",
  announcementBody:
    "mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground",
} as const;
