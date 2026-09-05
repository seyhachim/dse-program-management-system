import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./my-courses-client.tsx", import.meta.url),
  "utf8",
);

describe("lecturer Course Specifications mobile layout", () => {
  test("renders a phone card path and keeps the DataTable desktop-only", () => {
    expect(source).toContain("MOBILE_COURSES_LAYOUT.cards");
    expect(source).toContain("MOBILE_COURSES_LAYOUT.card");
    expect(source).toContain("MOBILE_COURSES_LAYOUT.desktop");
    expect(source).toContain("<DataTable");
    expect(source).toContain("Open Specification");
  });

  test("uses touch-safe filters and preserves curriculum grouping", () => {
    expect(source).toContain("MOBILE_COURSES_LAYOUT.filterTrigger");
    expect(source).toContain("courseSpecRowGroupLabel(row)");
    expect(source).toContain("Search course specifications");
  });
});
