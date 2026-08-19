import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CircleX,
  Info,
  Link2,
  Radio,
  Trophy,
} from "lucide-react";
import { cn } from "../lib/cn.ts";

/**
 * Theme-driven application status badge.
 *
 * `StatusTone` intentionally keeps the original public union so existing
 * callers that use it for exhaustive maps do not break. New workflow UI can
 * use the additive semantic tones through `StatusBadgeTone`.
 */
export type StatusTone = "live" | "upcoming" | "tournament" | "neutral";
export type LegacyStatusTone = StatusTone;
export type SemanticStatusTone = "success" | "warning" | "info" | "danger" | "neutral";
export type StatusBadgeTone = StatusTone | SemanticStatusTone;

const semanticToneStyles: Record<SemanticStatusTone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  info: "bg-info-bg text-info",
  danger: "bg-error-bg text-error",
  neutral: "bg-inactive-bg text-inactive",
};

const legacyToneStyles: Record<Exclude<StatusTone, "neutral">, string> = {
  live: "bg-status-live-bg text-status-live",
  upcoming: "bg-status-upcoming-bg text-status-upcoming",
  tournament: "bg-status-tournament-bg text-status-tournament",
};

export function statusToneClass(tone: StatusBadgeTone): string {
  if (tone === "live" || tone === "upcoming" || tone === "tournament") {
    return legacyToneStyles[tone];
  }
  return semanticToneStyles[tone];
}

const toneIcons: Record<StatusBadgeTone, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  danger: CircleX,
  neutral: Link2,
  live: Radio,
  upcoming: CalendarClock,
  tournament: Trophy,
};

export interface StatusBadgeProps {
  tone: StatusBadgeTone;
  label: string;
  icon?: boolean;
  className?: string;
}

export function StatusBadge({ tone, label, icon = true, className }: StatusBadgeProps) {
  const Icon = toneIcons[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        statusToneClass(tone),
        className,
      )}
    >
      {icon ? <Icon className="h-3 w-3" /> : null}
      {label}
    </span>
  );
}
