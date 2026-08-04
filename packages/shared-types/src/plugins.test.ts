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

test("QA Reviewer has no admin-only routes but keeps the unscoped placeholders", () => {
  const routes = navForRole(pluginManifests, ["qa_reviewer"]);
  expect(routes.some((r) => r.path === "/students")).toBe(false);
  expect(routes.some((r) => r.path === "/dashboard")).toBe(false);
  expect(routes.some((r) => r.path === "/qa-dashboard")).toBe(true);
});
