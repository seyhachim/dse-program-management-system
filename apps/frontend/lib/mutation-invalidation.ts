export type MutationMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export const MUTABLE_PROTECTED_RESOURCES = [
  "students",
  "courses",
  "course-spec",
  "offerings",
  "dashboard",
  "academic-calendar",
  "results",
  "qa",
  "action-research",
] as const;

export type MutableProtectedResource =
  (typeof MUTABLE_PROTECTED_RESOURCES)[number];

export interface MutationInvalidation {
  domain:
    | "students"
    | "courses"
    | "offerings"
    | "course-spec"
    | "academic-calendar"
    | "results"
    | "qa-sar"
    | "action-research";
  resources: readonly MutableProtectedResource[];
  reason: string;
}

export interface ConfirmedMutationEvent {
  method: MutationMethod;
  path: string;
  invalidation: MutationInvalidation;
}

type ConfirmedMutationListener = (event: ConfirmedMutationEvent) => void;

const confirmedMutationListeners = new Set<ConfirmedMutationListener>();

function pathname(path: string): string {
  return path.split("?", 1)[0] ?? path;
}

/**
 * Return the smallest shared-query resource set that can become stale after a
 * confirmed mutation. Rules intentionally target mutable semantic resources,
 * never immutable release/snapshot resource names.
 */
export function invalidationForSuccessfulMutation(
  method: MutationMethod,
  path: string,
): MutationInvalidation | null {
  const cleanPath = pathname(path);

  if (/^\/api\/courses\/[^/]+\/spec(?:\/|$)/.test(cleanPath)) {
    return {
      domain: "course-spec",
      resources: ["course-spec", "courses", "dashboard"],
      reason:
        "CourseSpec writes invalidate the live editor cache plus course progress and dashboard summary.",
    };
  }

  if (/^\/api\/offerings\/[^/]+\/enrollments(?:\/|$)/.test(cleanPath)) {
    return {
      domain: "offerings",
      resources: ["offerings", "dashboard"],
      reason: "Enrollment changes affect offering projections and dashboard totals.",
    };
  }

  if (
    /^\/api\/offerings(?:\/[^/]+)?$/.test(cleanPath) &&
    !cleanPath.includes("/attendance")
  ) {
    return {
      domain: "offerings",
      resources: ["offerings", "courses", "dashboard"],
      reason: "Offering structure affects offering lists, course section presence, and dashboard summary.",
    };
  }

  if (/^\/api\/students(?:\/|$)/.test(cleanPath)) {
    return {
      domain: "students",
      resources: ["students", "dashboard"],
      reason: "Student lifecycle changes affect student lists and dashboard summary.",
    };
  }

  if (/^\/api\/courses(?:\/[^/]+)?$/.test(cleanPath)) {
    return {
      domain: "courses",
      resources: ["courses", "offerings", "dashboard"],
      reason: "Course structure affects course lists, offering course projections, and dashboard summary.",
    };
  }

  if (/^\/api\/programme\/[^/]+\/academic-calendar(?:\/|$)/.test(cleanPath)) {
    return {
      domain: "academic-calendar",
      resources: ["academic-calendar"],
      reason: "Draft, revision, and publication writes change mutable calendar projections.",
    };
  }

  if (/^\/api\/student-portal\/manage\/results(?:\/|$)/.test(cleanPath)) {
    return {
      domain: "results",
      resources: ["results"],
      reason: "Result save, publish, finalize, and correction writes change live result projections.",
    };
  }

  // Action Research is mounted by the QA plugin, so this specific rule must
  // precede the generic /api/qa rule. This keeps research cache invalidation
  // semantic and avoids accidentally treating it as a SAR/evidence mutation.
  if (/^\/api\/qa\/action-research(?:\/|$)/.test(cleanPath)) {
    return {
      domain: "action-research",
      resources: ["action-research"],
      reason: "Action Research lifecycle writes invalidate mutable project and cycle projections.",
    };
  }

  if (
    /^\/api\/(?:aun-qa|qa)(?:\/|$)/.test(cleanPath) ||
    cleanPath.includes("/sar-book/") ||
    cleanPath.includes("/qa-sar/")
  ) {
    return {
      domain: "qa-sar",
      resources: ["qa"],
      reason: "QA/SAR live workflow writes invalidate mutable QA projections only.",
    };
  }

  return null;
}

export function subscribeConfirmedMutation(
  listener: ConfirmedMutationListener,
): () => void {
  confirmedMutationListeners.add(listener);
  return () => confirmedMutationListeners.delete(listener);
}

function notifyConfirmedMutation(method: MutationMethod, path: string): void {
  const invalidation = invalidationForSuccessfulMutation(method, path);
  if (!invalidation) return;

  const event: ConfirmedMutationEvent = { method, path, invalidation };
  confirmedMutationListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      // Cache refresh is best-effort after the server has already committed the
      // mutation. A listener failure must never turn confirmed success into a
      // false user-visible write failure.
      console.error("Protected query invalidation listener failed", error);
    }
  });
}

/**
 * Emit invalidation only after the server mutation has resolved successfully.
 * Rejections (including 401/403/409) propagate without emitting any event.
 */
export async function runConfirmedMutation<T>(
  method: MutationMethod,
  path: string,
  perform: () => Promise<T>,
): Promise<T> {
  const result = await perform();
  notifyConfirmedMutation(method, path);
  return result;
}
