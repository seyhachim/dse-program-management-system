export const MOBILE_SHELL_LAYOUT = {
  topbar:
    "flex h-16 min-w-0 items-center justify-between border-b border-border bg-card px-3 sm:px-6",
  topbarLeading: "flex min-w-0 flex-1 items-center gap-2 sm:gap-3",
  sidebarTrigger: "size-11 shrink-0 md:hidden",
  titleBlock: "min-w-0",
  title: "truncate text-base font-semibold text-foreground sm:text-lg",
  subtitle: "hidden truncate text-sm text-muted-foreground md:block",
  userArea: "flex shrink-0 items-center text-sm text-muted-foreground",
  userTrigger:
    "flex min-h-11 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  userDetails: "hidden text-left leading-tight md:block",
  userChevron: "hidden h-4 w-4 text-muted-foreground sm:block",
} as const;
