"use client";

import { useCallback, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QueryRefreshStatus } from "@/components/query-refresh-status";
import { useMe } from "@/lib/auth";
import {
  loadCourseSpecAuthoringData,
  type CourseSpecAuthoringData,
} from "@/lib/course-spec-authoring-data";
import { courseSpecApi } from "@/lib/course-spec";
import {
  COURSE_SPEC_QUERY_GC_MS,
  COURSE_SPEC_STALE_MS,
  courseSpecAuthoringQueryKey,
  courseSpecCoreQueryKey,
} from "@/lib/course-spec-query";
import { SpecClient } from "./spec-client";

type PinnedEditor = {
  data: CourseSpecAuthoringData;
  updatedAt: number;
};

export function CourseSpecCachedEditor({ courseId }: { courseId: string }) {
  const { me, loading: meLoading } = useMe();
  const queryClient = useQueryClient();
  const userId = me?.id ?? "pending";

  const authoringQuery = useQuery({
    queryKey: courseSpecAuthoringQueryKey(userId, courseId),
    queryFn: async () => {
      const spec = await queryClient.fetchQuery({
        queryKey: courseSpecCoreQueryKey(userId, courseId),
        queryFn: () => courseSpecApi.get(courseId),
        staleTime: COURSE_SPEC_STALE_MS.draft,
        gcTime: COURSE_SPEC_QUERY_GC_MS,
      });
      return loadCourseSpecAuthoringData(courseId, spec);
    },
    enabled: Boolean(me?.id),
    staleTime: COURSE_SPEC_STALE_MS.draft,
    gcTime: COURSE_SPEC_QUERY_GC_MS,
  });

  // The query may refresh while a lecturer is typing. Pin the exact bundle that
  // the editor was created from as soon as local interaction starts. Fresh
  // server data can continue updating the cache, but it cannot remount the form
  // and replace local input. The refreshed cache becomes visible on the next
  // route mount, while all writes remain server-authoritative in this session.
  const [pinnedEditor, setPinnedEditor] = useState<PinnedEditor | null>(null);

  const markDirty = useCallback(() => {
    if (pinnedEditor || !authoringQuery.data) return;
    setPinnedEditor({
      data: authoringQuery.data,
      updatedAt: authoringQuery.dataUpdatedAt,
    });
  }, [authoringQuery.data, authoringQuery.dataUpdatedAt, pinnedEditor]);

  const handleButtonInteraction = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!button || button.closest('[role="tab"]')) return;
      markDirty();
    },
    [markDirty],
  );

  if (meLoading || (!authoringQuery.data && authoringQuery.isPending)) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!authoringQuery.data) {
    return (
      <div className="rounded-lg border border-status-upcoming bg-status-upcoming-bg px-4 py-2 text-sm text-status-upcoming">
        {authoringQuery.error instanceof Error
          ? authoringQuery.error.message
          : "Failed to load the course specification"}
      </div>
    );
  }

  const data = pinnedEditor?.data ?? authoringQuery.data;
  const editorVersion = pinnedEditor?.updatedAt ?? authoringQuery.dataUpdatedAt;

  return (
    <div
      onInputCapture={markDirty}
      onChangeCapture={markDirty}
      onClickCapture={handleButtonInteraction}
    >
      <QueryRefreshStatus
        hasData
        isPending={authoringQuery.isPending}
        isFetching={authoringQuery.isFetching}
        isError={authoringQuery.isError}
        label="Course Specification"
      />
      <SpecClient
        key={`${courseId}:${editorVersion}`}
        courseId={courseId}
        initialData={data}
      />
    </div>
  );
}
