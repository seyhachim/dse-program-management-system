"use client";

import { useCallback } from "react";
import Link from "next/link";
import { Bell, Pin } from "lucide-react";
import { studentPortalApi } from "@/lib/student-portal";
import { MOBILE_STUDENT_PORTAL_LAYOUT } from "../mobile-student-portal-layout";
import {
  EmptyState,
  PortalError,
  PortalLoading,
  usePortalData,
} from "../portal-state";

export function PortalAnnouncements() {
  const load = useCallback(() => studentPortalApi.announcements(), []);
  const { data, loading, error } = usePortalData(load);

  if (loading) return <PortalLoading />;
  if (error || !data) {
    return <PortalError message={error ?? "Could not load announcements"} />;
  }
  if (!data.length) {
    return (
      <EmptyState
        title="No announcements"
        description="Updates from your lecturers will appear here."
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {data.map((item) => (
        <article
          key={item.id}
          className={MOBILE_STUDENT_PORTAL_LAYOUT.announcementCard}
        >
          <div className="flex min-w-0 items-start gap-3 md:gap-4">
            <span className="shrink-0 rounded-xl bg-primary/10 p-2.5 text-primary md:p-3">
              {item.pinned ? (
                <Pin className="h-5 w-5" />
              ) : (
                <Bell className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/portal/courses/${item.offeringId}`}
                  className="inline-flex min-h-11 max-w-full items-center break-words text-xs font-semibold uppercase tracking-wide text-primary"
                >
                  {item.courseCode} · Section {item.sectionCode}
                </Link>
                {item.pinned ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    Pinned
                  </span>
                ) : null}
              </div>
              <h2 className="mt-1 break-words text-lg font-semibold md:mt-2">
                {item.title}
              </h2>
              <p className={MOBILE_STUDENT_PORTAL_LAYOUT.announcementBody}>
                {item.body}
              </p>
              <p className="mt-4 break-words text-xs text-muted-foreground">
                {item.authorName} ·{" "}
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.publishedAt))}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
