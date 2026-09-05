import { describe, expect, test } from "bun:test";
import type { PluginRoute } from "@dse-pms/shared-types";
import {
  deriveMobileNavItems,
  MOBILE_APP_SHELL_LAYOUT,
  MOBILE_MORE_NAV_ACTION,
  MOBILE_NAV_MAX_PRIMARY_ITEMS,
  mobileRouteMatches,
  resolveActiveMobileNavPath,
  resolveMobileNavProfile,
} from "./mobile-app-navigation";

function route(
  path: string,
  label = path,
  icon = "book",
): PluginRoute {
  return { path, label, icon };
}

describe("mobile app navigation", () => {
  test("lecturer gets four high-frequency authorized destinations", () => {
    const items = deriveMobileNavItems(
      ["lecturer"],
      [
        route("/lecturer-overview", "Overview", "dashboard"),
        route("/courses", "Course Specifications", "book"),
        route("/attendance", "Attendance", "check-square"),
        route("/assessments-results", "Assessments / Results", "file-check"),
        route("/announcements", "Announcements", "bell"),
      ],
    );

    expect(items.map((item) => item.path)).toEqual([
      "/lecturer-overview",
      "/courses",
      "/attendance",
      "/assessments-results",
    ]);
    expect(items.map((item) => item.label)).toEqual([
      "Home",
      "Courses",
      "Attendance",
      "Results",
    ]);
    expect(items.length).toBe(MOBILE_NAV_MAX_PRIMARY_ITEMS);
  });

  test("student nested routes resolve to the most specific active tab", () => {
    const items = deriveMobileNavItems(
      ["student"],
      [
        route("/portal", "Home", "home"),
        route("/portal/courses", "My Courses", "book"),
        route("/portal/schedule", "Schedule", "calendar"),
        route("/portal/results", "Results", "chart"),
      ],
    );

    expect(resolveActiveMobileNavPath("/portal/courses/abc", items)).toBe(
      "/portal/courses",
    );
    expect(mobileRouteMatches("/portal/courses/abc", "/portal")).toBe(true);
    expect(mobileRouteMatches("/portalish", "/portal")).toBe(false);
  });

  test("unauthorized preferred paths are omitted rather than invented", () => {
    const items = deriveMobileNavItems(
      ["program_coordinator"],
      [
        route("/dashboard", "Dashboard", "dashboard"),
        route("/courses", "Course Management", "book"),
        route("/aun-qa", "AUN-QA Overview", "shield-check"),
      ],
    );

    expect(items.map((item) => item.path)).toEqual([
      "/dashboard",
      "/courses",
      "/aun-qa",
    ]);
    expect(items.some((item) => item.path === "/curriculum")).toBe(false);
  });

  test("guardian home mirrors the existing explicit parent portal entry", () => {
    expect(deriveMobileNavItems(["guardian"], [])).toEqual([
      { path: "/parent", icon: "home", label: "Home" },
    ]);
  });

  test("coarse role profile wins over additive QA contributor role", () => {
    expect(resolveMobileNavProfile(["lecturer", "qa_contributor"])).toBe(
      "lecturer",
    );
    expect(resolveMobileNavProfile(["program_coordinator", "lecturer"])).toBe(
      "program_coordinator",
    );
  });

  test("More is explicitly the existing sidebar action", () => {
    expect(MOBILE_MORE_NAV_ACTION).toEqual({
      label: "More",
      action: "sidebar",
    });
  });

  test("shell layout reserves fixed-nav space and respects installed-PWA safe area", () => {
    expect(MOBILE_APP_SHELL_LAYOUT.bottomNav).toContain("md:hidden");
    expect(MOBILE_APP_SHELL_LAYOUT.bottomNav).toContain(
      "env(safe-area-inset-bottom)",
    );
    expect(MOBILE_APP_SHELL_LAYOUT.inset).toContain(
      "env(safe-area-inset-bottom)",
    );
    expect(MOBILE_APP_SHELL_LAYOUT.inset).toContain("md:pb-0");
    expect(MOBILE_APP_SHELL_LAYOUT.bottomNavItem).toContain("flex-1");
  });
});
