export const MOBILE_COURSES_LAYOUT = {
  toolbar: "space-y-2 md:hidden",
  search:
    "h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring",
  addButton:
    "inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground",
  cards: "space-y-3 md:hidden",
  card: "rounded-2xl border border-border bg-card p-4 shadow-sm",
  primaryAction:
    "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground",
  secondaryAction:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground",
  desktop: "hidden md:block",
} as const;

export function courseSpecHref(courseId: string, canReview: boolean): string {
  return canReview
    ? `/courses/${courseId}/spec?tab=reviewSubmit`
    : `/courses/${courseId}/spec`;
}
