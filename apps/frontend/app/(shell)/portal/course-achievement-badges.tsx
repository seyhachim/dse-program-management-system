import type {
  PortalCourseAchievementBadge,
  PortalCourseAchievementSummary,
} from "@dse-pms/shared-types";
import {
  CalendarCheck2,
  CheckCircle2,
  Leaf,
  Lock,
  Target,
  Trophy,
} from "lucide-react";

const ACHIEVED_STYLES: Record<PortalCourseAchievementBadge["kind"], string> = {
  great_start:
    "bg-emerald-500/15 text-emerald-600 ring-emerald-500/35 dark:text-emerald-300",
  reliable_learner:
    "bg-blue-500/15 text-blue-600 ring-blue-500/35 dark:text-blue-300",
  perfect_attendance:
    "bg-amber-500/15 text-amber-700 ring-amber-500/35 dark:text-amber-300",
  strong_performance:
    "bg-orange-500/15 text-orange-700 ring-orange-500/35 dark:text-orange-300",
  course_excellence:
    "bg-violet-500/15 text-violet-700 ring-violet-500/35 dark:text-violet-300",
};

const LOCKED_STYLE =
  "bg-muted/45 text-muted-foreground ring-border/70 opacity-70";

function AchievementIcon({ badge }: { badge: PortalCourseAchievementBadge }) {
  if (!badge.achieved) return <Lock className="h-3 w-3" aria-hidden="true" />;

  switch (badge.kind) {
    case "great_start":
      return <Leaf className="h-3 w-3" aria-hidden="true" />;
    case "reliable_learner":
      return <CheckCircle2 className="h-3 w-3" aria-hidden="true" />;
    case "perfect_attendance":
      return <CalendarCheck2 className="h-3 w-3" aria-hidden="true" />;
    case "strong_performance":
      return <Target className="h-3 w-3" aria-hidden="true" />;
    case "course_excellence":
      return <Trophy className="h-3 w-3" aria-hidden="true" />;
  }
}

export function CourseAchievementBadges({
  summary,
}: {
  summary: PortalCourseAchievementSummary | null;
}) {
  if (!summary) return null;

  return (
    <div
      className="mt-2.5 flex flex-wrap gap-1.5"
      aria-label="Course achievement badges"
    >
      {summary.badges.map((badge) => (
        <span
          key={badge.kind}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold leading-none ring-1 sm:text-[11px] ${
            badge.achieved ? ACHIEVED_STYLES[badge.kind] : LOCKED_STYLE
          }`}
          title={badge.detail}
          aria-label={`${badge.title}: ${badge.achieved ? "achieved" : `${badge.progress}% progress`}`}
        >
          <AchievementIcon badge={badge} />
          {badge.title}
        </span>
      ))}
    </div>
  );
}
