import {
  BarChart3,
  Bell,
  Book,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
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

/**
 * Frontend information architecture for the existing QA domain. Keeping these
 * tasks in one section makes the authoring flow obvious without changing any QA
 * backend route, permission, or source of truth.
 */
const qaNavigationManifest: PluginManifest = {
  ...(pluginManifests.find((manifest) => manifest.id === "qa") ?? {
    id: "qa",
    name: "Quality Assurance",
    version: "0.2.0",
  }),
  routes: [
    {
      label: "AUN-QA Overview",
      path: "/aun-qa",
      icon: "shield-check",
      roles: ["admin", "program_coordinator", "qa_contributor"],
      group: "Quality Assurance",
    },
    {
      label: "SAR Workspace",
      path: "/aun-qa/sar",
      icon: "file-text",
      roles: ["admin", "program_coordinator", "qa_contributor", "qa_reviewer"],
      group: "Quality Assurance",
    },
    {
      label: "Evidence Library",
      path: "/aun-qa/evidence",
      icon: "library",
      roles: ["admin", "program_coordinator", "qa_contributor", "qa_reviewer"],
      group: "Quality Assurance",
    },
    {
      label: "Review & Approval",
      path: "/aun-qa/review",
      icon: "clipboard-check",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
    {
      label: "SAR Preview",
      path: "/aun-qa/sar-preview",
      icon: "file-text",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
    },
    {
      label: "Evidence Analysis",
      path: "/qa-dashboard",
      icon: "file-check",
      roles: ["admin", "program_coordinator", "qa_reviewer"],
      group: "Quality Assurance",
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
  ...pluginManifests.filter(
    (manifest) => manifest.id !== "rubrics" && manifest.id !== "qa",
  ),
  rubricBankManifest,
  qaNavigationManifest,
  gradingScaleManagementManifest,
  curriculumWorkspaceManifest,
  studentHandbookManifest,
  communityManifest,
  publicInformationManifest,
];

const SIDEBAR_ROLES_WITHOUT_PLACEHOLDERS: Role[] = ["admin", "program_coordinator"];

function sidebarManifestsForRoles(roles: Role[]): PluginManifest[] {
  const hidePlaceholders = roles.some((role) => SIDEBAR_ROLES_WITHOUT_PLACEHOLDERS.includes(role));
  return hidePlaceholders
    ? frontendManifests.filter((manifest) => manifest.id !== "placeholders")
    : frontendManifests;
}

export const iconMap: Record<string, LucideIcon> = {
  users: Users,
  book: Book,
  layers: Layers,
  presentation: Presentation,
  dashboard: LayoutDashboard,
  "clipboard-list": ClipboardList,
  "clipboard-check": ClipboardCheck,
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
