import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getNavRoutes } from "@/lib/nav";

const root = join(import.meta.dir);

describe("Student Opportunities navigation and mobile shell", () => {
  test("students browse but cannot open the management route in navigation", () => {
    const student = getNavRoutes(["student"]);
    expect(student.some((route) => route.path === "/opportunities")).toBe(true);
    expect(student.some((route) => route.path === "/opportunities/manage")).toBe(false);
    const staff = getNavRoutes(["program_coordinator"]);
    expect(staff.some((route) => route.path === "/opportunities/manage")).toBe(true);
  });
  test("every opportunity page retains its top bar and vertical scroll container", () => {
    for (const page of ["page.tsx", "manage/page.tsx", "[id]/page.tsx"]) {
      const source = readFileSync(join(root, page), "utf8");
      expect(source).toContain("<Topbar");
      expect(source).toContain("overflow-y-auto");
    }
  });
});
