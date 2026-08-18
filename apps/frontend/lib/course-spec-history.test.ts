import { describe, expect, test } from "bun:test";
import { comparisonHref, exactVersionHref } from "./course-spec-history";

describe("course specification history routes", () => {
  test("builds an exact-version URL", () => {
    expect(exactVersionHref("course-1", "spec-1")).toBe("/courses/course-1/spec/versions/spec-1");
  });

  test("builds a deterministic comparison URL", () => {
    expect(comparisonHref("course-1", "spec-1", "spec-2")).toBe("/courses/course-1/spec/compare?from=spec-1&to=spec-2");
  });
});
