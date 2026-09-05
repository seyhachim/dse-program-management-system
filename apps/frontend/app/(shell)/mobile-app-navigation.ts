import type { PluginRoute, Role } from "@dse-pms/shared-types";

export const MOBILE_NAV_MAX_PRIMARY_ITEMS = 4;

export const MOBILE_MORE_NAV_ACTION = {
  label: "More",
  action: "sidebar",
} as const;

export const MOBILE_APP_SHELL_LAYOUT = {
  inset:
    "h-screen overflow-hidden pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0",
  bottomNav:
    "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/90 md:hidden",
  bottomNavInner: "mx-auto flex h-16 max-w-lg items-stretch px-1",
  bottomNavItem:
    "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
  bottomNavItemActive: "text-primary",
  bottomNavIcon: "h-5 w-5 shrink-0",
  bottomNavLabel: "max-w-full truncate leading-none",
} as const;

type MobileNavProfile =
  | "admin"
  | "program_coordinator"
  | "program_secretary"
  | "lecturer"
  | "qa_reviewer"
  | "qa_contributor"
  | "student"
  | "guardian";

const MOBILE_PROFILE_PRIORITY: MobileNavProfile[] = [
  "admin",
  "program_coordinator",
  "program_secretary",
  "lecturer",
  "qa_reviewer",
  "qa_contributor",
  "student",
  "guardian",
];

const MOBILE_PRIMARY_PATHS: Record<MobileNavProfile, readonly string[]> = {
  admin: ["/dashboard", "/courses", "/offerings", "/aun-qa"],
  program_coordinator: ["/dashboard", "/courses", "/curriculum", "/aun-qa"],
  program_secretary: ["/dashboard", "/students", "/offerings", "/lecturers"],
  lecturer: [
    "/lecturer-overview",
    "/courses",
    "/attendance",
    "/assessments-results",
  ],
  qa_reviewer: [
    "/aun-qa",
    "/aun-qa/review",
    "/aun-qa/evidence",
    "/qa-dashboard",
  ],
  qa_contributor: ["/aun-qa", "/aun-qa/sar", "/aun-qa/evidence"],
  student: ["/portal", "/portal/courses", "/portal/schedule", "/portal/results"],
  guardian: ["/parent"],
};

const MOBILE_LABEL_OVERRIDES: Record<string, string> = {
  "/dashboard": "Home",
  "/lecturer-overview": "Home",
  "/portal": "Home",
  "/parent": "Home",
  "/courses": "Courses",
  "/assessments-results": "Results",
  "/portal/courses": "Courses",
  "/portal/schedule": "Schedule",
  "/portal/results": "Results",
  "/lecturers": "Staff",
  "/aun-qa": "QA",
  "/aun-qa/review": "Review",
  "/aun-qa/evidence": "Evidence",
  "/qa-dashboard": "Analysis",
};

const GUARDIAN_HOME_ROUTE: PluginRoute = {
  label: "Parent Home",
  path: "/parent",
  icon: "home",
  roles: ["guardian"],
};

export interface MobileNavItem {
  label: string;
  path: string;
  icon?: string;
}

export function resolveMobileNavProfile(roles: Role[]): MobileNavProfile | null {
  return (
    MOBILE_PROFILE_PRIORITY.find((candidate) => roles.includes(candidate)) ?? null
  );
}

/**
 * Derive a small phone navigation set from routes that are already authorized by
 * the shared manifest. Path preferences are presentation-only: a missing or
 * unauthorized route is omitted rather than becoming a new permission source.
 * Guardian Home mirrors the existing sidebar's explicit /parent entry because
 * that portal is intentionally outside the plugin manifest today.
 */
export function deriveMobileNavItems(
  roles: Role[],
  authorizedRoutes: PluginRoute[],
): MobileNavItem[] {
  const profile = resolveMobileNavProfile(roles);
  if (!profile) return [];

  const routeByPath = new Map(
    authorizedRoutes.map((route) => [route.path, route] as const),
  );

  if (profile === "guardian" && roles.includes("guardian")) {
    routeByPath.set(GUARDIAN_HOME_ROUTE.path, GUARDIAN_HOME_ROUTE);
  }

  return MOBILE_PRIMARY_PATHS[profile]
    .map((path) => routeByPath.get(path))
    .filter((route): route is PluginRoute => Boolean(route))
    .slice(0, MOBILE_NAV_MAX_PRIMARY_ITEMS)
    .map((route) => ({
      path: route.path,
      icon: route.icon,
      label: MOBILE_LABEL_OVERRIDES[route.path] ?? route.label,
    }));
}

export function mobileRouteMatches(pathname: string, routePath: string): boolean {
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

/** Nested primary destinations (e.g. /portal vs /portal/courses) resolve to the
 * most specific visible item so only one bottom-navigation item is active. */
export function resolveActiveMobileNavPath(
  pathname: string,
  items: MobileNavItem[],
): string | null {
  return (
    items
      .filter((item) => mobileRouteMatches(pathname, item.path))
      .sort((a, b) => b.path.length - a.path.length)[0]?.path ?? null
  );
}
