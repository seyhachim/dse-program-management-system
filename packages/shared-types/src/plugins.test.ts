import { expect, test } from "bun:test";
import { navForRole, navGroupsForRole, pluginManifests, routeAllowsRole, type PluginRoute } from "./plugins.ts";
import { Role } from "./auth.ts";

const ALL_ROLES = Role.options;

test("every role has at least one reachable nav route (no role-access-guard redirect loop)", () => {
  for (const role of ALL_ROLES) {
    expect(navForRole(pluginManifests, [role]).length).toBeGreaterThan(0);
  }
});

test("routeAllowsRole is open to everyone when a route has no roles restriction", () => {
  const route: PluginRoute = { label: "Help", path: "/help", icon: "help-circle" };
  for (const role of ALL_ROLES) {
    expect(routeAllowsRole(route, [role])).toBe(true);
  }
});

test("Program Coordinator/Secretary see Course Offerings; Lecturer and Student do not", () => {
  const offerings = navForRole(pluginManifests, ["program_coordinator"]).find((r) => r.path === "/offerings");
  expect(offerings).toBeDefined();
  expect(navForRole(pluginManifests, ["program_secretary"]).some((r) => r.path === "/offerings")).toBe(true);
  expect(navForRole(pluginManifests, ["lecturer"]).some((r) => r.path === "/offerings")).toBe(false);
  expect(navForRole(pluginManifests, ["student"]).some((r) => r.path === "/offerings")).toBe(false);
});

test("a caller with multiple roles sees the union of both roles' routes", () => {
  const routes = navForRole(pluginManifests, ["lecturer", "program_secretary"]).map((r) => r.path);
  expect(routes).toContain("/courses");
  expect(routes).toContain("/students");
});

test("Lecturer gets the focused workspace routes in the intended sidebar clusters", () => {
  const lecturerRoutes = navForRole(pluginManifests, ["lecturer"]);
  const paths = lecturerRoutes.map((r) => r.path);

  expect(paths).toContain("/lecturer-overview");
  expect(paths).toContain("/course-delivery");
  expect(paths).toContain("/teaching-schedule");
  expect(paths).toContain("/courses");
  expect(paths).toContain("/attendance");
  expect(paths).toContain("/assessments-results");
  expect(paths).toContain("/announcements");
  expect(paths).toContain("/feedback");
  expect(paths).toContain("/account-settings");

  expect(lecturerRoutes.find((r) => r.path === "/lecturer-overview")?.group).toBe("Teaching");
  expect(lecturerRoutes.find((r) => r.path === "/course-delivery")?.group).toBe("Academic");
  expect(lecturerRoutes.find((r) => r.path === "/teaching-schedule")?.group).toBe("Teaching");
  expect(lecturerRoutes.find((r) => r.path === "/courses")?.group).toBe("Curriculum");
  expect(lecturerRoutes.find((r) => r.path === "/attendance")?.group).toBe("Delivery");
  expect(lecturerRoutes.find((r) => r.path === "/assessments-results")?.group).toBe("Delivery");
  expect(lecturerRoutes.find((r) => r.path === "/announcements")?.group).toBe("Delivery");
  expect(lecturerRoutes.find((r) => r.path === "/feedback")?.group).toBe("Delivery");
  expect(lecturerRoutes.find((r) => r.path === "/account-settings")?.group).toBe("Personal");

  const groups = navGroupsForRole(pluginManifests, ["lecturer"])
    .filter((group) => group.label !== "footer")
    .map((group) => group.label);
  expect(groups).toEqual(["Teaching", "Academic", "Curriculum", "Delivery", "Personal"]);

  const coursesRoute = lecturerRoutes.find((r) => r.path === "/courses");
  expect(coursesRoute?.label).toBe("Course Specifications");

  expect(paths).not.toContain("/my-tasks");
  expect(paths).not.toContain("/templates-guides");

  for (const role of ["admin", "program_coordinator", "program_secretary", "qa_reviewer", "student"] as const) {
    const rolePaths = navForRole(pluginManifests, [role]).map((r) => r.path);
    expect(rolePaths).not.toContain("/lecturer-overview");
    expect(rolePaths).not.toContain("/course-delivery");
    expect(rolePaths).not.toContain("/teaching-schedule");
    expect(rolePaths).not.toContain("/attendance");
    expect(rolePaths).not.toContain("/assessments-results");
    expect(rolePaths).not.toContain("/announcements");
    expect(rolePaths).not.toContain("/feedback");
    expect(rolePaths).not.toContain("/account-settings");
  }
});

test("QA Reviewer lands on its own QA Dashboard, not the general Dashboard, and has no admin-only routes", () => {
  const routes = navForRole(pluginManifests, ["qa_reviewer"]);
  expect(routes.some((r) => r.path === "/students")).toBe(false);
  expect(routes.some((r) => r.path === "/dashboard")).toBe(false);
  expect(routes.some((r) => r.path === "/users")).toBe(false);
  expect(routes.some((r) => r.path === "/settings")).toBe(false);
  expect(routes.some((r) => r.path === "/qa-dashboard")).toBe(true);
});

test("QA Dashboard is provided by the real QA plugin with explicit permissions", () => {
  const qa = pluginManifests.find((manifest) => manifest.id === "qa");
  expect(qa).toBeDefined();
  expect(qa?.routes?.some((route) => route.path === "/qa-dashboard")).toBe(true);
  expect(qa?.permissions).toEqual(["qa:read", "qa:write"]);
});

test("QA Reviewer can reach Course Specification content for review, and its own QA sections", () => {
  const routes = navForRole(pluginManifests, ["qa_reviewer"]).map((r) => r.path);
  expect(routes).toContain("/courses");
  expect(routes).toContain("/qa-dashboard");
  expect(routes).toContain("/cqi");
  expect(routes).toContain("/document-library");
  expect(routes).not.toContain("/audit-trail");
});

test("Lecturer and Student only see the routes actually built for them, not admin/coordinator placeholders", () => {
  for (const role of ["lecturer", "student"] as const) {
    const routes = navForRole(pluginManifests, [role]).map((r) => r.path);
    expect(routes).not.toContain("/users");
    expect(routes).not.toContain("/settings");
    expect(routes).not.toContain("/programme-management");
  }
});

test("Program Secretary is excluded from academic-decision entries reserved for the Coordinator (issue #101 §8)", () => {
  const routes = navForRole(pluginManifests, ["program_secretary"]).map((r) => r.path);
  expect(routes).not.toContain("/assessment-management");
  expect(routes).not.toContain("/cqi");
  expect(routes).toContain("/programme-management");
  expect(routes).toContain("/teaching-management");
});