"use client";

import { useRef } from "react";
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

  // Do not switch the editor component underneath a lecturer who may have local
  // unsaved input. The first resolved workflow state chooses the client for this
  // route mount. Background refresh still updates the protected cache, and every
  // write is re-authorized/revalidated by the backend. A later route mount uses
  // the refreshed workflow state.
  const initialWorkflowRef = useRef<{
    resolved: boolean;
    status: CourseSpecReviewStatus | null;
  }>({ resolved: false, status: null });

  if (!initialWorkflowRef.current.resolved && specQuery.data) {
    initialWorkflowRef.current = {
      resolved: true,
      status: specQuery.data.review?.status ?? null,
    };
  }

  if (meLoading || (!initialWorkflowRef.current.resolved && specQuery.isPending)) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!initialWorkflowRef.current.resolved) {
    return (
      <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
        {specQuery.error instanceof Error
          ? specQuery.error.message
          : "Failed to determine the course specification workflow state"}
      </div>
    );
  }

  return isCourseSpecEditableStatus(initialWorkflowRef.current.status) ? (
    <CourseSpecCachedEditor courseId={courseId} />
  ) : (
    <ReadOnlySpecClient courseId={courseId} />
  );
}
