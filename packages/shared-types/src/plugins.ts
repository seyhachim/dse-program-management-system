/**
 * The plugin contract — the single source of truth shared by the backend
 * (which attaches an Express router + service to each plugin) and the frontend
 * (which renders the sidebar nav from the same manifest). Because both apps
 * import this file, the contract can never drift between them.
 */

import type { Role } from "./auth.ts";

export interface PluginRoute {
  /** Label shown in the sidebar. */
  label: string;
  /** Frontend path, e.g. "/students". */
  path: string;
  /** Optional icon key resolved by the frontend nav. */
  icon?: string;
  /**
   * Roles allowed to see this route in the sidebar and open its page.
   * Omitted = visible to every authenticated role. Enforced on the frontend
   * (sidebar filter + shell page guard); backend permission strings gate the API.
   */
  roles?: Role[];
  /**
   * Sidebar section this route is grouped under (e.g. "Academic"). Omitted =
   * rendered ungrouped, above any labeled section. The special value "footer"
   * is rendered in the sidebar footer instead of the main nav list.
   */
  group?: string;
}

/**
 * Metadata portion of a plugin. Pure data — no server or React code — so it is
 * safe to import from either app.
 */
export interface PluginManifest {
  /** Stable id, also the API mount segment: /api/{id}. */
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Sidebar routes contributed by the plugin. */
  routes?: PluginRoute[];
  /** Permission strings this plugin defines, e.g. "students:read". */
  permissions?: string[];
}

/**
 * Full backend-side plugin. `TService` is the plugin's public service surface,
 * reachable cross-plugin via `registry.get(id).service` — the in-process
 * equivalent of an API call, never a direct internal import.
 */
export interface DSEPlugin<TService = unknown> {
  manifest: PluginManifest;
  /** Express Router — typed as unknown here to keep this package framework-free. */
  router: unknown;
  service: TService;
}

/**
 * The manifest registry: the ordered list of plugin metadata the whole system
 * knows about. Adding a plugin later means appending its manifest here (and
 * registering its router/service on the backend).
 */
export const studentsManifest: PluginManifest = {
  id: "students",
  name: "Students",
  version: "0.1.0",
  description: "Student records — CRUD, list, profile.",
  // Program Secretary maintains student/class lists (issue #101 §6); Program
  // Coordinator's proposed sidebar has no Students entry, so it's left off.
  routes: [
    {
      label: "Students",
      path: "/students",
      icon: "users",
      roles: ["admin", "program_secretary"],
      group: "Academic",
    },
  ],
  permissions: ["students:read", "students:write"],
};

export const coursesManifest: PluginManifest = {
  id: "courses",
  name: "Courses",
  version: "0.1.0",
  description: "Courses — CRUD, list, assign lecturer.",
  // Programme-wide roles keep the curriculum-management course entry. The
  // lecturer-facing /courses entry lives in lecturerWorkspaceManifest so its
  // label and grouping can follow the lecturer-specific information architecture.
  routes: [
    {
      label: "Course Management",
      path: "/courses",
      icon: "book",
      // qa_reviewer already holds courses:read (seed.ts) but had no frontend
      // route to reach it — this is QA's path to Course Specification content
      // for review (issue #101 §15); Add/Edit/Delete stay hidden via the
      // `courses:manage` permission check the page already does (PR #110).
      roles: [
        "admin",
        "program_coordinator",
        "program_secretary",
        "qa_reviewer",
      ],
      group: "Academic",
    },
  ],
  permissions: ["courses:read", "courses:write", "courses:manage", "courses:review"],
};

/** Lecturer-focused cross-course workspace navigation. */
export const lecturerWorkspaceManifest: PluginManifest = {
  id: "lecturer-workspace",
  name: "Lecturer Workspace",
  version: "0.2.0",
  description:
    "Lecturer navigation organized around teaching, curriculum, delivery, and personal work.",
  routes: [
    {
      label: "Overview",
      path: "/lecturer-overview",
      icon: "dashboard",
      roles: ["lecturer"],
      group: "Teaching",
    },
    {
      label: "Course Delivery",
      path: "/course-delivery",
      icon: "megaphone",
      roles: ["lecturer"],
      group: "Academic",
    },
    {
      label: "Teaching Schedule",
      path: "/teaching-schedule",
      icon: "calendar",
      roles: ["lecturer"],
      group: "Teaching",
    },
    {
      label: "Course Specifications",
      path: "/courses",
      icon: "book",
      roles: ["lecturer"],
      group: "Curriculum",
    },
    {
      label: "Attendance",
      path: "/attendance",
      icon: "check-square",
      roles: ["lecturer"],
      group: "Delivery",
    },
    {
      label: "Assessments / Results",
      path: "/assessments-results",
      icon: "file-check",
      roles: ["lecturer"],
      group: "Delivery",
    },
    {
      label: "Announcements",
      path: "/announcements",
      icon: "bell",
      roles: ["lecturer"],
      group: "Delivery",
    },
    {
      label: "Feedback",
      path: "/feedback",
      icon: "chart",
      roles: ["lecturer"],
      group: "Delivery",
    },
    {
      label: "Account Settings",
      path: "/account-settings",
      icon: "settings",
      roles: ["lecturer"],
      group: "Personal",
    },
  ],
};

export const offeringsManifest: PluginManifest = {
  id: "offerings",
  name: "Course Offerings",
  version: "0.1.0",
  description: "Links Students, Courses and Lecturers for a given term.",
  routes: [
    {
      label: "Course Offerings",
      path: "/offerings",
      icon: "layers",
      roles: ["admin", "program_coordinator", "program_secretary"],
      group: "Academic",
    },
  ],
  permissions: ["offerings:read", "offerings:write", "offerings:manage"],
};

export const lecturersManifest: PluginManifest = {
  id: "lecturers",
  name: "Lecturers",
  version: "0.1.0",
  description:
    "Lecturers — Users with the lecturer role, incl. syllabus contact details.",
  routes: [
    {
      label: "Lecturers",
      path: "/lecturers",
      icon: "presentation",
      roles: ["admin", "program_coordinator", "program_secretary"],
      group: "Academic",
    },
  ],
  permissions: ["lecturers:read", "lecturers:write"],
};

/**
 * Ungrouped "Dashboard" entry — split from `placeholdersManifest` below and
 * placed first in `pluginManifests` so its ungrouped bucket is created before
 * "Academic" is, and it renders above every labeled section (issue #49).
 */
export const dashboardManifest: PluginManifest = {
  id: "dashboard",
  name: "Dashboard",
  version: "0.1.0",
  description:
    "Programme overview: key counts, course spec completion, offering/student status.",
  // Programme-wide roles only (PROGRAMME_WIDE_ROLES, mirrored here since this
  // manifest has no backend plugin of its own to import the constant from): the
  // dashboard aggregates totals from Students/Courses/Offerings unscoped, so a
  // lecturer viewing it would see numbers that don't match the lecturer-scoped
  // Courses/Spec Progress panels on the same page.
  routes: [
    {
      label: "Dashboard",
      path: "/dashboard",
      icon: "dashboard",
      roles: ["admin", "program_coordinator", "program_secretary"],
    },
  ],
};

/** Student-only learning-information portal. All backend reads are scoped to
 * the authenticated student's enrollments; this manifest controls navigation,
 * not the authorization boundary. */
export const studentPortalManifest: PluginManifest = {
  id: "student-portal",
  name: "Student Portal",
  version: "0.1.0",
  description: "Enrolled courses, schedule, approved learning information, results, and feedback.",
  routes: [
    { label: "Home", path: "/portal", icon: "home", roles: ["student"] },
    { label: "My Courses", path: "/portal/courses", icon: "book", roles: ["student"], group: "Learning" },
    { label: "Schedule", path: "/portal/schedule", icon: "calendar", roles: ["student"], group: "Learning" },
    { label: "Results", path: "/portal/results", icon: "chart", roles: ["student"], group: "Progress" },
    { label: "Announcements", path: "/portal/announcements", icon: "bell", roles: ["student"], group: "Progress" },
  ],
  permissions: ["student-portal:read", "student-portal:feedback"],
};

export const programmeManifest: PluginManifest = {
  id: "programme",
  name: "Programme Management",
  version: "0.1.0",
  description:
    "Programme-level academic configuration — learning outcomes, graduate competencies, and their alignment.",
  routes: [
    {
      label: "Programme Management",
      path: "/programme-management",
      icon: "clipboard-list",
      roles: ["admin", "program_coordinator", "program_secretary"],
      group: "Academic",
    },
  ],
  permissions: ["programme:read", "programme:write"],
};

export const qaManifest: PluginManifest = {
  id: "qa",
  name: "Quality Assurance",
  version: "0.2.0",
  description:
    "Programme-scoped AUN-QA evidence, contributor work, self-assessment, review, and readiness workflow.",
  routes: [
    {
      label: "AUN-QA Workspace",
      path: "/aun-qa",
      icon: "shield-check",
      roles: ["admin", "program_coordinator", "qa_contributor"],
      group: "Quality Assurance",
    },
    {
      label: "QA Evidence Analysis",
      path: "/qa-dashboard",
      icon: "file-check",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
  ],
  permissions: [
    "qa:read",
    "qa:write",
    "qa:contribute",
    "qa:review",
    "qa:manage",
  ],
};

/**
 * Sidebar-only placeholder pages for sections not built yet (issue #49). Each
 * route renders a generic "coming soon" page — no backend plugin/router, since
 * `pluginManifests` (frontend nav) is fully decoupled from what's registered in
 * apps/backend/src/core/app.ts. Mirrors the inverse of methods/rubrics/auth
 * below, which register a backend plugin but contribute no sidebar route.
 *
 * `roles` on each entry follows the per-role sidebars proposed in issue #101
 * (§4 Admin, §5 Coordinator, §6 Secretary, §15 QA Reviewer) — Coordinator owns
 * academic/curriculum decisions, Secretary supports operationally but is
 * explicitly excluded from academic-decision entries (§8), and QA's own
 * "QA Dashboard" is its landing page distinct from the general `/dashboard`.
 * `Users`/`Settings`/`Audit Trail` are system administration and stay
 * admin-only, matching the role-comparison table (§18). `student` isn't
 * listed anywhere here — there's no student portal built yet, so it (like
 * every other unlisted role) only ever sees the unrestricted footer entry.
 */
export const placeholdersManifest: PluginManifest = {
  id: "placeholders",
  name: "Placeholders",
  version: "0.1.0",
  description:
    "Sidebar entries for sections not yet built — link to a coming-soon page.",
  routes: [
    {
      label: "Assessment Management",
      path: "/assessment-management",
      icon: "file-check",
      roles: ["admin", "program_coordinator"],
      group: "Academic",
    },
    {
      label: "Teaching Management",
      path: "/teaching-management",
      icon: "graduation-cap",
      roles: ["admin", "program_coordinator", "program_secretary"],
      group: "Academic",
    },
    {
      label: "Reports",
      path: "/reports",
      icon: "bar-chart",
      roles: [
        "admin",
        "program_coordinator",
        "program_secretary",
        "qa_reviewer",
      ],
      group: "Quality Assurance",
    },
    {
      label: "CQI",
      path: "/cqi",
      icon: "refresh-cw",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
    {
      label: "Document Library",
      path: "/document-library",
      icon: "file-text",
      roles: [
        "admin",
        "program_coordinator",
        "program_secretary",
        "qa_reviewer",
      ],
      group: "Quality Assurance",
    },
    {
      label: "Users",
      path: "/users",
      icon: "user-cog",
      roles: ["admin"],
      group: "Admin",
    },
    {
      label: "Settings",
      path: "/settings",
      icon: "settings",
      roles: ["admin"],
      group: "Admin",
    },
    {
      label: "Audit Trail",
      path: "/audit-trail",
      icon: "history",
      roles: ["admin"],
      group: "Admin",
    },
    {
      label: "Help & Support",
      path: "/help",
      icon: "help-circle",
      group: "footer",
    },
  ],
};

export const methodsManifest: PluginManifest = {
  id: "methods",
  name: "Methods",
  version: "0.1.0",
  description:
    "Teaching & assessment method vocabulary for course specs (§14).",
  permissions: ["methods:read", "methods:write"],
};

export const rubricsManifest: PluginManifest = {
  id: "rubrics",
  name: "Rubric Library",
  version: "0.1.0",
  description:
    "Reusable assessment rubrics — criteria × rating-scale grids shared across courses.",
  // No routes: reached from within a course's Course Specification → Assessment
  // section (Assessment → Rubric Library), not as a top-level sidebar entry.
  permissions: ["rubrics:read", "rubrics:write"],
};

export const authManifest: PluginManifest = {
  id: "auth",
  name: "Auth",
  version: "0.1.0",
  description:
    "Identity (GET /me) and admin-only account provisioning via Supabase.",
  // No routes: not a sidebar entry — account creation is embedded in the Lecturers page.
  permissions: ["accounts:create"],
};

export const pluginManifests: PluginManifest[] = [
  studentPortalManifest,
  dashboardManifest,
  studentsManifest,
  coursesManifest,
  lecturerWorkspaceManifest,
  offeringsManifest,
  lecturersManifest,
  programmeManifest,
  qaManifest,
  placeholdersManifest,
  methodsManifest,
  rubricsManifest,
  authManifest,
];

/**
 * Whether `route` is visible to a caller holding `roles` (issue #77 phase B —
 * a caller can hold more than one role, so this is a union check: the route
 * needs only one of the caller's roles to match, not all of them). A route
 * with no `roles` restriction is open to everyone.
 */
export function routeAllowsRole(route: PluginRoute, roles: Role[]): boolean {
  return (
    route.roles === undefined || route.roles.some((r) => roles.includes(r))
  );
}

/** Sidebar nav is generated automatically from plugin routes. */
export function navFromManifests(manifests: PluginManifest[]): PluginRoute[] {
  return manifests.flatMap((m) => m.routes ?? []);
}

/** Nav routes visible to a caller holding any of `roles` — the union across all of them. */
export function navForRole(
  manifests: PluginManifest[],
  roles: Role[],
): PluginRoute[] {
  return navFromManifests(manifests).filter((r) => routeAllowsRole(r, roles));
}

/** One sidebar section: `label` undefined = ungrouped, rendered with no heading. */
export interface NavGroup {
  label?: string;
  routes: PluginRoute[];
}

/**
 * Nav routes for `roles` (union across all of them), bucketed by `route.group` and ordered by each
 * group's first appearance across `manifests` — no separate priority field,
 * the manifest array order is the display order.
 */
export function navGroupsForRole(
  manifests: PluginManifest[],
  roles: Role[],
): NavGroup[] {
  const order: (string | undefined)[] = [];
  const buckets = new Map<string | undefined, PluginRoute[]>();
  for (const route of navForRole(manifests, roles)) {
    if (!buckets.has(route.group)) {
      buckets.set(route.group, []);
      order.push(route.group);
    }
    buckets.get(route.group)!.push(route);
  }
  return order.map((label) => ({ label, routes: buckets.get(label)! }));
}