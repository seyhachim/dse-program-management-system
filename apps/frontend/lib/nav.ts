import {
  BarChart3,
  Bell,
  Book,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FileCheck,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  Home,
  ChartNoAxesCombined,
  LibraryBig,
  Megaphone,
  Presentation,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  communityManifest,
  curriculumWorkspaceManifest,
  navForRole,
  navFromManifests,
  navGroupsForRole,
  pluginManifests,
  studentHandbookManifest,
  type NavGroup,
  type PluginManifest,
  type PluginRoute,
  type Role,
} from "@dse-pms/shared-types";

/**
 * Sidebar nav is generated from shared feature manifests. Community of Practice,
 * Programme Curriculum, and Student Handbook are additive manifests while the
 * legacy registry is gradually split into feature-owned manifests.
 *
 * The rubric backend manifest intentionally has no route because lecturers reach
 * rubrics from Course Specification. The authenticated Rubric Bank is an admin /
 * programme-coordinator management surface, so the frontend adds that route to
 * the existing rubric manifest without introducing a second rubric domain.
 */
const rubricBankManifest: PluginManifest = {
  ...(pluginManifests.find((manifest) => manifest.id === "rubrics") ?? {
    id: "rubrics",
    name: "Rubric Library",
    version: "0.1.0",
  }),
  routes: [
    {
      label: "Rubric Bank",
      path: "/rubric-bank",
      icon: "library",
      roles: ["admin", "program_coordinator"],
      group: "Academic",
    },
  ],
};

const gradingScaleManagementManifest: PluginManifest = {
  id: "programme-grading-scales",
  name: "Programme Rating Scales",
  version: "0.1.0",
  routes: [
    {
      label: "Rating Scales",
      path: "/programme-settings/rating-scales",
      icon: "settings",
      roles: ["admin", "program_coordinator"],
      group: "Academic",
    },
  ],
};

const publicInformationManifest: PluginManifest = {
  id: "public-programme-information",
  name: "Public Programme Information",
  version: "0.1.0",
  routes: [
    {
      label: "Public Information",
      path: "/public-information",
      icon: "megaphone",
      roles: ["admin", "program_coordinator"],
      group: "Administration",
    },
  ],
};

const frontendManifests = [
  ...pluginManifests.filter((manifest) => manifest.id !== "rubrics"),
  rubricBankManifest,
  gradingScaleManagementManifest,
  curriculumWorkspaceManifest,
  studentHandbookManifest,
  communityManifest,
  publicInformationManifest,
];

const SIDEBAR_ROLES_WITHOUT_PLACEHOLDERS: Role[] = ["admin", "program_coordinator"];
const AUN_QA_INTERNAL_PATHS = new Set([
  "/aun-qa/review",
  "/aun-qa/sar-preview",
  "/qa-dashboard",
]);

function hideInternalAunQaRoutes(manifest: PluginManifest): PluginManifest {
  if (!manifest.routes?.some((route) => AUN_QA_INTERNAL_PATHS.has(route.path))) {
    return manifest;
  }

  return {
    ...manifest,
    routes: manifest.routes.filter((route) => !AUN_QA_INTERNAL_PATHS.has(route.path)),
  };
}

function sidebarManifestsForRoles(roles: Role[]): PluginManifest[] {
  const hidePlaceholders = roles.some((role) => SIDEBAR_ROLES_WITHOUT_PLACEHOLDERS.includes(role));
  const manifests = hidePlaceholders
    ? frontendManifests.filter((manifest) => manifest.id !== "placeholders")
    : frontendManifests;

  return manifests.map(hideInternalAunQaRoutes);
}

export const iconMap: Record<string, LucideIcon> = {
  users: Users,
  book: Book,
  layers: Layers,
  presentation: Presentation,
  dashboard: LayoutDashboard,
  "clipboard-list": ClipboardList,
  "file-check": FileCheck,
  "graduation-cap": GraduationCap,
  "shield-check": ShieldCheck,
  "bar-chart": BarChart3,
  "refresh-cw": RefreshCw,
  "file-text": FileText,
  "user-cog": UserCog,
  settings: Settings,
  history: History,
  "help-circle": HelpCircle,
  "check-square": CheckSquare,
  calendar: CalendarDays,
  library: LibraryBig,
  home: Home,
  chart: ChartNoAxesCombined,
  bell: Bell,
  megaphone: Megaphone,
};

/** All nav routes, or — when roles are given — only those the caller's roles may see. */
export function getNavRoutes(roles?: Role[]): PluginRoute[] {
  return roles ? navForRole(frontendManifests, roles) : navFromManifests(frontendManifests);
}

/** Nav routes for `roles` (union across all of them), grouped into sidebar sections. */
export function getNavGroups(roles: Role[]): NavGroup[] {
  return navGroupsForRole(sidebarManifestsForRoles(roles), roles);
}
