import { describe, expect, test } from "bun:test";
import {
  COURSE_SPEC_QUERY_GC_MS,
  COURSE_SPEC_STALE_MS,
  courseSpecAuthoringQueryKey,
  courseSpecCoreQueryKey,
  courseSpecHistoryQueryKey,
} from "./course-spec-query";
import { QUERY_STALE_MS } from "./query-client";

describe("CourseSpec protected query keys", () => {
  test("scope live CourseSpec data by authenticated user and course", () => {
    expect(courseSpecCoreQueryKey("user-1", "course-1")).toEqual([
      "protected",
      "user",
      "user-1",
      "programme",
      "*",
      "course-spec",
      "course-1",
      "core",
    ]);
    expect(courseSpecAuthoringQueryKey("user-1", "course-1")).toEqual([
      "protected",
      "user",
      "user-1",
      "programme",
      "*",
      "course-spec",
      "course-1",
      "authoring",
    ]);
  });

  test("keeps version history separate while sharing CourseSpec invalidation", () => {
    expect(courseSpecHistoryQueryKey("user-2", "course-7")).toEqual([
      "protected",
      "user",
      "user-2",
      "programme",
      "*",
      "course-spec",
      "course-7",
      "history",
    ]);
  });

  test("uses the existing draft and operational freshness budgets", () => {
    expect(COURSE_SPEC_STALE_MS.draft).toBe(QUERY_STALE_MS.draft);
    expect(COURSE_SPEC_STALE_MS.history).toBe(QUERY_STALE_MS.operational);
    expect(COURSE_SPEC_QUERY_GC_MS).toBe(60 * 60_000);
  });
});
