import { describe, expect, test } from "bun:test";
import { courseSpecVersionLabel } from "./curriculum-course-spec-bindings-panel";

describe("curriculum CourseSpec binding UI", () => {
  test("renders an exact semantic CourseSpec version label", () => {
    expect(courseSpecVersionLabel({ version: "1.0" })).toBe("CourseSpec v1.0");
    expect(courseSpecVersionLabel({ version: "2.3" })).toBe("CourseSpec v2.3");
  });
});
