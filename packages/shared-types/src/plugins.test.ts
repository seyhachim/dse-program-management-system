import { expect, test } from "bun:test";
import { navForRole, pluginManifests, routeAllowsRole, type PluginRoute } from "./plugins.ts";
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
  expect(routes).toContain("/courses"); // lecturer route
  expect(routes).toContain("/students"); // program_secretary route
});

test("QA Reviewer lands on its own QA Dashboard, not the general Dashboard, and has no admin-only routes", () => {
  const routes = navForRole(pluginManifests, ["qa_reviewer"]);
  expect(routes.some((r) => r.path === "/students")).toBe(false);
  expect(routes.some((r) => r.path === "/dashboard")).toBe(false);
  expect(routes.some((r) => r.path === "/users")).toBe(false);
  expect(routes.some((r) => r.path === "/settings")).toBe(false);
  expect(routes.some((r) => r.path === "/qa-dashboard")).toBe(true);
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
