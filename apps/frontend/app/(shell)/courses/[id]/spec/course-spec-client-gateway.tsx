"use client";

import { useEffect, useState } from "react";
import type { CourseSpecReviewStatus } from "@dse-pms/shared-types";
import { ApiError } from "@/lib/api";
import { courseSpecApi } from "@/lib/course-spec";
import { ReadOnlySpecClient } from "./read-only-spec-client";
import { SpecClient } from "./spec-client";

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
  const [status, setStatus] = useState<CourseSpecReviewStatus | null>(null);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveWorkflowState() {
      setResolved(false);
      setError(null);
      try {
        const spec = await courseSpecApi.get(courseId);
        if (cancelled) return;
        setStatus(spec.review?.status ?? null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Failed to determine the course specification workflow state",
        );
      } finally {
        if (!cancelled) setResolved(true);
      }
    }

    void resolveWorkflowState();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (!resolved) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-status-live/40 bg-status-live/10 px-3 py-2 text-sm text-status-live">
        {error}
      </div>
    );
  }

  return isCourseSpecEditableStatus(status) ? (
    <SpecClient courseId={courseId} />
  ) : (
    <ReadOnlySpecClient courseId={courseId} />
  );
}
