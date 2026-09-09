export const MOBILE_STUDENT_PORTAL_LAYOUT = {
  homeStack: "space-y-4 md:space-y-6",
  hero: "rounded-2xl border border-border bg-card px-4 py-3 shadow-sm sm:px-5 sm:py-4",
  homeQuickActions: "grid grid-cols-3 gap-2 sm:gap-3",
  homeQuickAction:
    "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-2 py-2.5 text-center text-sm font-medium text-foreground shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  homeNextClass:
    "group block min-h-11 min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-5",
  compactCard: "rounded-2xl border border-border bg-card p-4 md:p-5",
  courseCard:
    "group flex min-h-0 min-w-0 flex-col rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-md md:min-h-64 md:p-5 md:hover:-translate-y-0.5",
  scheduleSurface: "mx-auto w-full max-w-3xl space-y-4 md:space-y-5",
  scheduleToolbar:
    "rounded-[1.75rem] border border-border/70 bg-muted/30 p-3 shadow-sm sm:p-4",
  scheduleDateStrip: "grid grid-cols-5 gap-2",
  scheduleDateButton:
    "flex min-h-16 min-w-0 flex-col items-center justify-center rounded-2xl border border-border bg-card px-1.5 py-2 text-foreground transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  scheduleDateButtonSelected:
    "border-primary bg-primary text-primary-foreground shadow-sm",
  scheduleMeeting:
    "group block min-w-0 rounded-[1.75rem] border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
  scheduleMeetingCurrent:
    "border-primary/40 bg-primary/10 ring-1 ring-primary/20",
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
