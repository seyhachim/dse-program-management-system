"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleCheck,
  Info,
  Loader2,
} from "lucide-react";

export type CourseSpecSaveFeedback = {
  state: "saving" | "saved" | "error";
  label: string;
};

export function CourseSpecAuthoringStack({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`space-y-5 ${className}`.trim()}>{children}</div>;
}

export function CourseSpecAuthoringHeader({
  title,
  description,
  ready,
  actions,
  feedback,
  meta,
}: {
  title: string;
  description: string;
  ready: boolean;
  actions?: ReactNode;
  feedback?: CourseSpecSaveFeedback;
  meta?: ReactNode;
}) {
  return (
    <header className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {feedback ? <SaveFeedback feedback={feedback} /> : null}
          {meta}
          <ReadinessPill ready={ready} />
          {actions}
        </div>
      </div>
    </header>
  );
}

export function CourseSpecNotice({
  tone = "info",
  children,
  onDismiss,
}: {
  tone?: "info" | "success" | "warning" | "error";
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const toneClasses = {
    info: "border-blue-200/70 bg-blue-50/50 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200",
    success:
      "border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200",
    warning:
      "border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200",
    error:
      "border-destructive/30 bg-destructive/5 text-destructive",
  }[tone];

  const icon = {
    info: <Info className="h-4 w-4" />,
    success: <CircleCheck className="h-4 w-4" />,
    warning: <AlertTriangle className="h-4 w-4" />,
    error: <AlertTriangle className="h-4 w-4" />,
  }[tone];

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${toneClasses}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">{children}</div>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-semibold opacity-80 hover:opacity-100"
        >
          Dismiss
        </button>
      ) : null}
    </div>
  );
}

export function CourseSpecEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      {icon ? (
        <div className="mx-auto flex h-10 w-10 items-center justify-center text-muted-foreground/60">
          {icon}
        </div>
      ) : null}
      <p className={icon ? "mt-3 text-sm font-semibold text-foreground" : "text-sm font-semibold text-foreground"}>
        {title}
      </p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

function ReadinessPill({ ready }: { ready: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
        ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
      }`}
    >
      {ready ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      {ready ? "Ready" : "Needs attention"}
    </span>
  );
}

function SaveFeedback({ feedback }: { feedback: CourseSpecSaveFeedback }) {
  const classes =
    feedback.state === "saved"
      ? "text-emerald-600 dark:text-emerald-400"
      : feedback.state === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${classes}`}>
      {feedback.state === "saving" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : feedback.state === "saved" ? (
        <CircleCheck className="h-3.5 w-3.5" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      {feedback.label}
    </span>
  );
}
