import { expect, test } from "bun:test";
import { getNavGroups, getNavRoutes } from "./nav";

const placeholderPaths = [
  "/assessment-management",
  "/teaching-management",
  "/reports",
  "/cqi",
  "/document-library",
  "/users",
  "/settings",
  "/audit-trail",
  "/help",
];

function sidebarPaths(roles: Parameters<typeof getNavGroups>[0]) {
  return getNavGroups(roles).flatMap((group) => group.routes.map((route) => route.path));
}

test("Rubric Bank is visible only to programme leadership", () => {
  const admin = getNavRoutes(["admin"]).find((route) => route.path === "/rubric-bank");
  const coordinator = getNavRoutes(["program_coordinator"]).find((route) => route.path === "/rubric-bank");
  const lecturer = getNavRoutes(["lecturer"]).find((route) => route.path === "/rubric-bank");
  const student = getNavRoutes(["student"]).find((route) => route.path === "/rubric-bank");

  expect(admin?.label).toBe("Rubric Bank");
  expect(coordinator?.label).toBe("Rubric Bank");
  expect(lecturer).toBeUndefined();
  expect(student).toBeUndefined();
});

test("Rating Scales management is visible only to Admin and Programme Coordinator", () => {
  const path = "/programme-settings/rating-scales";
  expect(getNavRoutes(["admin"]).find((route) => route.path === path)?.label).toBe("Rating Scales");
  expect(getNavRoutes(["program_coordinator"]).find((route) => route.path === path)?.label).toBe("Rating Scales");
  expect(getNavRoutes(["lecturer"]).find((route) => route.path === path)).toBeUndefined();
  expect(getNavRoutes(["program_secretary"]).find((route) => route.path === path)).toBeUndefined();
  expect(getNavRoutes(["qa_reviewer"]).find((route) => route.path === path)).toBeUndefined();
});

test("Programme Holidays is a leadership-only child route of Academic Calendar", () => {
  const path = "/academic-calendar/holidays";
  expect(getNavRoutes(["admin"]).find((route) => route.path === path)?.label).toBe("Programme Holidays");
  expect(getNavRoutes(["program_coordinator"]).find((route) => route.path === path)?.label).toBe("Programme Holidays");
  expect(getNavRoutes(["lecturer"]).find((route) => route.path === path)).toBeUndefined();
  expect(getNavRoutes(["program_secretary"]).find((route) => route.path === path)).toBeUndefined();
});

test("Admin and Programme Coordinator sidebars omit placeholder-only routes", () => {
  const adminPaths = sidebarPaths(["admin"]);
  const coordinatorPaths = sidebarPaths(["program_coordinator"]);

  for (const path of placeholderPaths) {
    expect(adminPaths).not.toContain(path);
    expect(coordinatorPaths).not.toContain(path);
  }

  for (const path of [
    "/dashboard",
    "/courses",
    "/offerings",
    "/lecturers",
    "/programme-management",
    "/academic-calendar",
    "/academic-calendar/holidays",
    "/rubric-bank",
    "/programme-settings/rating-scales",
    "/public-information",
    "/aun-qa",
  ]) {
    expect(adminPaths).toContain(path);
    expect(coordinatorPaths).toContain(path);
  }
});

test("Sidebar cleanup does not change route authorization metadata or other role navigation", () => {
  expect(getNavRoutes(["admin"]).some((route) => route.path === "/assessment-management")).toBe(true);
  expect(getNavRoutes(["program_coordinator"]).some((route) => route.path === "/cqi")).toBe(true);

  const secretaryPaths = sidebarPaths(["program_secretary"]);
  expect(secretaryPaths).toContain("/teaching-management");
  expect(secretaryPaths).toContain("/reports");
  expect(secretaryPaths).toContain("/document-library");
  expect(secretaryPaths).toContain("/help");
});
