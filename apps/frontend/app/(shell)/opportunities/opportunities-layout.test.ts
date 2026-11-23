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
  test("supports archival restore and optional opportunity posters", () => {
    const management = readFileSync(join(root, "manage/manage-opportunities-client.tsx"), "utf8");
    const browse = readFileSync(join(root, "opportunities-client.tsx"), "utf8");
    expect(management).toContain("Restore to draft");
    expect(management).toContain("Poster / thumbnail");
    expect(management).toContain("preparePosterUpload");
    expect(management).toContain("posterProcessing");
    expect(browse).toContain("item.posterUrl");
    expect(browse).toContain("/opportunities/participation");
  });
  test("student choice is private; lecturer dashboard is a separate route", () => {
    const detail = readFileSync(join(root, "[id]/opportunity-detail-client.tsx"), "utf8");
    const dashboard = readFileSync(join(root, "participation/participation-client.tsx"), "utf8");
    expect(detail).toContain("I'm planning to join");
    expect(detail).toContain("Other students see only the total");
    expect(dashboard).toContain("Interested students");
  });
  test("every opportunity page retains its top bar and vertical scroll container", () => {
    for (const page of ["page.tsx", "manage/page.tsx", "[id]/page.tsx", "participation/page.tsx"]) {
      const source = readFileSync(join(root, page), "utf8");
      expect(source).toContain("<Topbar");
      expect(source).toContain("overflow-y-auto");
    }
  });
});
