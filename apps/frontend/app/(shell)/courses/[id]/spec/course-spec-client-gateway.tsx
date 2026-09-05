"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CourseSpecReviewStatus } from "@dse-pms/shared-types";
import { useMe } from "@/lib/auth";
import { courseSpecApi } from "@/lib/course-spec";
import {
  COURSE_SPEC_QUERY_GC_MS,
  COURSE_SPEC_STALE_MS,
  courseSpecCoreQueryKey,
} from "@/lib/course-spec-query";
import { CourseSpecCachedEditor } from "./course-spec-cached-editor";
import { ReadOnlySpecClient } from "./read-only-spec-client";

const EDITABLE_STATUSES = new Set<CourseSpecReviewStatus>([
  "draft",
  "changesRequested",
]);

export function isCourseSpecEditableStatus(
  status: CourseSpecReviewStatus | null | undefined,
): boolean {
  return status == null || EDITABLE_STATUSES.has(status);
}

function ResolvedCourseSpecClient({
  courseId,
  initialStatus,
}: {
  courseId: string;
  initialStatus: CourseSpecReviewStatus | null;
}) {
  // Freeze the workflow client chosen for this route mount. If a background
  // refresh discovers a workflow transition, do not replace an active editor
  // underneath possible unsaved input. Backend write/review guards still fail
  // closed immediately, and the next route mount uses the refreshed cache.
  const [routeStatus] = useState(initialStatus);

  return isCourseSpecEditableStatus(routeStatus) ? (
    <CourseSpecCachedEditor courseId={courseId} />
  ) : (
    <ReadOnlySpecClient courseId={courseId} />
  );
}

export function CourseSpecClientGateway({ courseId }: { courseId: string }) {
  const { me, loading: meLoading } = useMe();
  const userId = me?.id ?? "pending";
  const specQuery = useQuery({
    queryKey: courseSpecCoreQueryKey(userId, courseId),
    queryFn: () => courseSpecApi.get(courseId),
    enabled: Boolean(me?.id),
    staleTime: COURSE_SPEC_STALE_MS.draft,
    gcTime: COURSE_SPEC_QUERY_GC_MS,
  });

  if (meLoading || (!specQuery.data && specQuery.isPending)) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!specQuery.data) {
    return (
      <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
        {specQuery.error instanceof Error
          ? specQuery.error.message
          : "Failed to determine the course specification workflow state"}
      </div>
    );
  }

  return (
    <ResolvedCourseSpecClient
      courseId={courseId}
      initialStatus={specQuery.data.review?.status ?? null}
    />
  );
}
